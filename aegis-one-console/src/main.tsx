import React from 'react';
import { createRoot } from 'react-dom/client';
import Console from './Console';
import './index.css';
import './theme.css';
import './clean.css';
import './refine.css';
import './visibility.css';
import './reports/reports.css';
import './keyboard';

createRoot(document.getElementById('root')!).render(<Console />);
