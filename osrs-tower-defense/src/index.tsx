import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { TowerDefenseApp } from './TowerDefenseApp';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <TowerDefenseApp />
  </React.StrictMode>
);