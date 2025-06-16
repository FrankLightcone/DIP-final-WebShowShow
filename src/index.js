import React from 'react';
import ReactDOM from 'react-dom/client';
import { PolotnoContainer, SidePanelWrap, WorkspaceWrap } from 'polotno';
import { Toolbar } from 'polotno/toolbar/toolbar';
import { PagesTimeline } from 'polotno/pages-timeline';
import { ZoomButtons } from 'polotno/toolbar/zoom-buttons';
import { SidePanel, DEFAULT_SECTIONS } from 'polotno/side-panel';
import { Workspace } from 'polotno/canvas/workspace';

import '@blueprintjs/core/lib/css/blueprint.css';

import { createStore } from 'polotno/model/store';
import { SharpnessSection } from './SharpnessEffect';
import { SmoothingSection } from './SmoothingEffect'; // 导入磨皮功能
import { DocumentScannerSection } from './DocumentScannerSection';
import { WhiteningSection } from './WhiteningEffect'; // 导入美白功能
import { ImHistSection } from './ImHist.js'; // 导入直方图功能
import { BWAndFiltersSection } from './BWAndFiltersEffect.js';
import { HistogramEnhancementSection } from './HistogramEnhancementSection'; // 导入新的直方图增强功能
import { TextCorrectionSection } from './TextCorrectionEffect'; // 导入文本矫正功能


const store = createStore({
  key: 'nFA5H9elEytDyPyvKL7T', // you can create it here: https://polotno.com/cabinet/
  // you can hide back-link on a paid license
  // but it will be good if you can keep it for Polotno project support
  showCredit: true,
});
const page = store.addPage();

// 创建自定义的 sections 数组，包含默认的和新的锐化功能
const sections = [
  ...DEFAULT_SECTIONS,
  SharpnessSection,
  DocumentScannerSection,
  SmoothingSection, // 添加磨皮功能
  WhiteningSection, // 添加美白功能
  ImHistSection, // 添加直方图功能
  BWAndFiltersSection, // 添加黑白和滤镜功能
  HistogramEnhancementSection, // 添加新的直方图增强功能
  TextCorrectionSection, // 添加文本矫正功能

];

export const App = ({ store }) => {
  return (
    <PolotnoContainer style={{ width: '100vw', height: '100vh' }}>
      <SidePanelWrap>
        <SidePanel store={store} sections={sections} />
      </SidePanelWrap>
      <WorkspaceWrap>
        <Toolbar store={store} downloadButtonEnabled />
        <Workspace store={store} />
        <ZoomButtons store={store} />
        <PagesTimeline store={store} />
      </WorkspaceWrap>
    </PolotnoContainer>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App store={store} />);