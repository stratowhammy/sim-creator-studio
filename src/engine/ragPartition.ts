import {
  RagDocumentChunk,
  SimulationState,
} from '../types/simulation';

/**
 * Builds the initial RAG index from the simulation state.
 * Strictly respects epistemic partitioning: each chunk includes knownByPlayerIds.
 */
export function buildRagIndexFromState(state: SimulationState): RagDocumentChunk[] {
  const chunks: RagDocumentChunk[] = [];
  const allPlayerIds = Object.keys(state.characters);

  // 1. Master Narrative / Global Lore
  if (state.masterNarrative) {
    chunks.push({
      chunkId: `chunk_lore_${state.id}`,
      simulationId: state.id,
      content: state.masterNarrative,
      sourceType: 'GLOBAL_LORE',
      sourceRefId: state.id,
      knownByPlayerIds: [...allPlayerIds],
    });
  }

  // 2. Character Backstories (Private Narratives)
  for (const character of Object.values(state.characters)) {
    if (character.privateNarrativeBio) {
      chunks.push({
        chunkId: `chunk_bio_${character.playerId}`,
        simulationId: state.id,
        content: `Dossier for ${character.characterName} (${character.publicRole}): ${character.privateNarrativeBio}`,
        sourceType: 'CHARACTER_BACKSTORY',
        sourceRefId: character.playerId,
        knownByPlayerIds: [character.playerId],
      });
    }
  }

  // 3. InfoCards
  for (const card of Object.values(state.cards)) {
    chunks.push({
      chunkId: `chunk_card_${card.id}`,
      simulationId: state.id,
      content: `[Card: ${card.title}] [Secrecy: ${card.secrecy}] Fact: ${card.canonicalFact} (Tags: ${card.topicTags.join(', ')})`,
      sourceType: 'INFO_CARD',
      sourceRefId: card.id,
      knownByPlayerIds: [...card.knownByPlayerIds],
    });
  }

  // 4. Interaction Transcripts
  for (const interaction of state.interactions) {
    const transcriptText = interaction.beats
      .map((b) => b.generatedSentence || `[Beat ${b.sentenceIndex}] ${b.outcomeTier} by ${b.speakerId}`)
      .join(' ');

    chunks.push({
      chunkId: `chunk_interaction_${interaction.id}`,
      simulationId: state.id,
      content: `Interaction between ${interaction.initiatorPlayerId} and ${interaction.targetPlayerId} (${interaction.interactionType}): ${transcriptText}`,
      sourceType: 'INTERACTION_TRANSCRIPT',
      sourceRefId: interaction.id,
      knownByPlayerIds: [interaction.initiatorPlayerId, interaction.targetPlayerId],
    });
  }

  return chunks;
}

/**
 * Synchronize RAG chunks with updated card knowledge or new interactions
 */
export function syncRagIndex(state: SimulationState): void {
  // Update knownByPlayerIds on card chunks
  for (const card of Object.values(state.cards)) {
    const existing = state.ragIndex.find(
      (c) => c.sourceType === 'INFO_CARD' && c.sourceRefId === card.id
    );
    if (existing) {
      existing.knownByPlayerIds = [...card.knownByPlayerIds];
    } else {
      state.ragIndex.push({
        chunkId: `chunk_card_${card.id}`,
        simulationId: state.id,
        content: `[Card: ${card.title}] [Secrecy: ${card.secrecy}] Fact: ${card.canonicalFact} (Tags: ${card.topicTags.join(', ')})`,
        sourceType: 'INFO_CARD',
        sourceRefId: card.id,
        knownByPlayerIds: [...card.knownByPlayerIds],
      });
    }
  }

  // Add any new interactions
  for (const interaction of state.interactions) {
    const existing = state.ragIndex.find(
      (c) => c.sourceType === 'INTERACTION_TRANSCRIPT' && c.sourceRefId === interaction.id
    );
    if (!existing) {
      const transcriptText = interaction.beats
        .map((b) => b.generatedSentence || `[Beat ${b.sentenceIndex}] ${b.outcomeTier} by ${b.speakerId}`)
        .join(' ');

      state.ragIndex.push({
        chunkId: `chunk_interaction_${interaction.id}`,
        simulationId: state.id,
        content: `Interaction between ${interaction.initiatorPlayerId} and ${interaction.targetPlayerId} (${interaction.interactionType}): ${transcriptText}`,
        sourceType: 'INTERACTION_TRANSCRIPT',
        sourceRefId: interaction.id,
        knownByPlayerIds: [interaction.initiatorPlayerId, interaction.targetPlayerId],
      });
    }
  }
}

export interface RagQueryResult {
  chunk: RagDocumentChunk;
  score: number;
}

/**
 * Strict RAG Partition Filter:
 * Hard metadata pre-filter before any semantic/keyword ranking.
 * Any chunk where chunk.knownByPlayerIds does NOT include queryingPlayerId is completely invisible.
 */
export function queryPartitionedRag(
  ragIndex: RagDocumentChunk[],
  queryingPlayerId: string,
  query: string,
  topK: number = 5
): RagQueryResult[] {
  // 1. Mandatory Row-Level Security (RLS) partition pre-filter
  const partitionedChunks = ragIndex.filter((chunk) =>
    chunk.knownByPlayerIds.includes(queryingPlayerId)
  );

  if (!query || query.trim() === '') {
    return partitionedChunks.slice(0, topK).map((chunk) => ({ chunk, score: 1.0 }));
  }

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (queryTerms.length === 0) {
    return partitionedChunks.slice(0, topK).map((chunk) => ({ chunk, score: 1.0 }));
  }

  // Keyword relevance scoring
  const scoredResults: RagQueryResult[] = [];

  for (const chunk of partitionedChunks) {
    const text = chunk.content.toLowerCase();
    let matches = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) {
        matches += 1;
      }
    }

    if (matches > 0) {
      const score = matches / queryTerms.length;
      scoredResults.push({ chunk, score });
    }
  }

  // Sort descending by score
  scoredResults.sort((a, b) => b.score - a.score);

  return scoredResults.slice(0, topK);
}
