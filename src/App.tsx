import React, { useState } from 'react';
import { SimulationState } from './types/simulation';
import { createStationHeliosScenario } from './alpha/scenarioData';
import { buildRagIndexFromState } from './engine/ragPartition';
import { SimulationWorkspace } from './components/layout/SimulationWorkspace';
import { AuthoringStudio } from './components/studio/AuthoringStudio';

export const App: React.FC = () => {
  const [simulationState, setSimulationState] = useState<SimulationState>(() => {
    const initialState = createStationHeliosScenario();
    initialState.ragIndex = buildRagIndexFromState(initialState);
    return initialState;
  });

  const [currentView, setCurrentView] = useState<'SIMULATION' | 'STUDIO'>('SIMULATION');

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {currentView === 'SIMULATION' ? (
        <SimulationWorkspace
          state={simulationState}
          onUpdateState={setSimulationState}
          onOpenStudio={() => setCurrentView('STUDIO')}
        />
      ) : (
        <AuthoringStudio
          simulationState={simulationState}
          onUpdateState={setSimulationState}
          onLaunchSimulation={() => setCurrentView('SIMULATION')}
        />
      )}
    </div>
  );
};

export default App;
