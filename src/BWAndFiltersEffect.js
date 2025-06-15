import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// 黑白与滤镜效果面板组件
export const BWAndFiltersPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [intensity, setIntensity] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filter, setFilter] = useState('bw');
  const canvasRef = useRef(null);
  const originalImageRef = useRef(null);

  // 当选中元素改变时，保存原始图像
  useEffect(() => {
    if (element && element.type === 'image' && element.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        originalImageRef.current = img;
      };
      img.src = element.src;
    }
  }, [element?.src]);

  if (!element || element.type !== 'image') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>请选择一个图像来应用黑白或滤镜效果</p>
      </div>
    );
  }


  // 怀旧滤镜（Sepia）
  const applySepia = (imageData, strength) => {
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const tr = 0.393 * r + 0.769 * g + 0.189 * b;
      const tg = 0.349 * r + 0.686 * g + 0.168 * b;
      const tb = 0.272 * r + 0.534 * g + 0.131 * b;
      // 插值，保留一定原色
      pixels[i] = r * (1 - strength) + tr * strength;
      pixels[i + 1] = g * (1 - strength) + tg * strength;
      pixels[i + 2] = b * (1 - strength) + tb * strength;
    }
    return imageData;
  };

  // 冷色滤镜（蓝色调）
  const applyCool = (imageData, strength) => {
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      // 增加蓝色，减少红色
      pixels[i] = pixels[i] * (1 - strength * 0.3); // R
      pixels[i + 2] = pixels[i + 2] + 40 * strength; // B
    }
    return imageData;
  };

  // 暖色滤镜（红色调）
  const applyWarm = (imageData, strength) => {
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      // 增加红色，减少蓝色
      pixels[i] = pixels[i] + 40 * strength; // R
      pixels[i + 2] = pixels[i + 2] * (1 - strength * 0.3); // B
    }
    return imageData;
  };

  const applyFilter = async () => {
    if (!originalImageRef.current) return;
    setIsProcessing(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = originalImageRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let processedData;
      const s = intensity / 100;
      switch (filter) {
        case 'sepia':
          processedData = applySepia(imageData, s);
          break;
        case 'cool':
          processedData = applyCool(imageData, s);
          break;
        case 'warm':
          processedData = applyWarm(imageData, s);
          break;
        default:
          processedData = imageData;
      }
      ctx.putImageData(processedData, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          element.set({ src: url });
          element.set({ customFilter: filter, customFilterIntensity: intensity });
        }
      }, 'image/png');
    } catch (error) {
      console.error('滤镜处理失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetFilter = () => {
    if (originalImageRef.current) {
      element.set({
        src: originalImageRef.current.src,
        customFilter: 'none',
        customFilterIntensity: 0
      });
      setIntensity(100);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginBottom: '20px' }}>滤镜</h3>
      <div style={{ marginBottom: '20px' }}>
        <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>选择滤镜：</p>
        <RadioGroup
          onChange={(e) => setFilter(e.currentTarget.value)}
          selectedValue={filter}
        >
          <Radio label="怀旧（Sepia）" value="sepia" />
          <Radio label="冷色" value="cool" />
          <Radio label="暖色" value="warm" />
        </RadioGroup>
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          效果强度: {intensity}%
        </label>
        <Slider
          min={0}
          max={100}
          stepSize={1}
          value={intensity}
          onChange={setIntensity}
          labelStepSize={25}
        />
      </div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Button
          onClick={applyFilter}
          loading={isProcessing}
          intent="primary"
        >
          应用滤镜
        </Button>
        <Button
          onClick={resetFilter}
          disabled={!originalImageRef.current}
        >
          重置
        </Button>
      </div>
      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '15px',
        borderRadius: '5px',
        marginBottom: '15px',
        fontSize: '12px'
      }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>滤镜说明：</p>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>怀旧</strong>：仿古色调，适合复古风格</li>
          <li><strong>冷色</strong>：增强蓝色调，适合冷静氛围</li>
          <li><strong>暖色</strong>：增强红色调，适合温馨氛围</li>
        </ul>
      </div>
      <div style={{ fontSize: '12px', color: '#666' }}>
        <p><strong>使用提示：</strong></p>
        <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
          <li>怀旧：适合复古、怀旧风格照片</li>
          <li>冷色：适合表现冷静、科技感</li>
          <li>暖色：适合表现温暖、温馨氛围</li>
        </ul>
      </div>
      {/* 隐藏的画布用于图像处理 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
});

// 自定义图标组件
const BWFiltersIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <circle cx="7" cy="12" r="5" fill="gray" opacity="0.7" />
    <circle cx="17" cy="12" r="5" fill="orange" opacity="0.5" />
    <circle cx="12" cy="7" r="3" fill="blue" opacity="0.4" />
  </svg>
);

// 导出滤镜效果的 SectionTab 配置
export const BWAndFiltersSection = {
  name: 'bwfilters',
  Tab: (props) => (
    <SectionTab name="滤镜" {...props}>
      <BWFiltersIcon />
    </SectionTab>
  ),
  Panel: BWAndFiltersPanel,
}; 