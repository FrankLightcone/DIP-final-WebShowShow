import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

export const ImHistPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [intensity, setIntensity] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filter, setFilter] = useState('bw');
  const canvasRef = useRef(null);
  const originalImageRef = useRef(null);

  // 保存原始图片
  useEffect(() => {
    if (element && element.type === 'image' && element.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        originalImageRef.current = img;
        // 初始化canvas
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = element.src;
    }
  }, [element?.src]);

  // 灰度化
  const toGray = (imageData) => {
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      // 常用加权平均法
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
    }
    return imageData;
  };

  // 直方图均衡化
  const histEqualization = (imageData) => {
    const pixels = imageData.data;
    const hist = new Array(256).fill(0);
    // 统计灰度直方图
    for (let i = 0; i < pixels.length; i += 4) {
      hist[pixels[i]]++;
    }
    // 计算累计分布函数（CDF）
    const cdf = new Array(256).fill(0);
    cdf[0] = hist[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + hist[i];
    }
    // 归一化
    const cdfMin = cdf.find(v => v > 0);
    const total = pixels.length / 4;
    const map = new Array(256);
    for (let i = 0; i < 256; i++) {
      map[i] = Math.round((cdf[i] - cdfMin) / (total - cdfMin) * 255);
      if (map[i] < 0) map[i] = 0;
    }
    // 应用均衡化
    for (let i = 0; i < pixels.length; i += 4) {
      const v = map[pixels[i]];
      pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
    }
    return imageData;
  };

  const handleApply = () => {
    if (!originalImageRef.current) return;
    setIsProcessing(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = originalImageRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (filter === 'bw') {
        imageData = toGray(imageData);
      } else if (filter === 'hist') {
        imageData = toGray(imageData);
        imageData = histEqualization(imageData);
      }
      ctx.putImageData(imageData, 0, 0);
      // 更新Polotno元素
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          element.set({ src: url });
        }
      }, 'image/png');
    } catch (e) {
      console.error('处理失败', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // 没有选中图片时的提示
  if (!element || element.type !== 'image') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>请选择一个图像来应用该效果</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h3>图像黑白与直方图均衡化</h3>
      <canvas ref={canvasRef} style={{ maxWidth: '100%', marginBottom: 16 }} />
      <div style={{ marginBottom: 16 }}>
        <RadioGroup
          selectedValue={filter}
          onChange={e => setFilter(e.currentTarget.value)}
          inline
        >
          <Radio label="黑白" value="bw" />
          <Radio label="直方图均衡化" value="hist" />
        </RadioGroup>
      </div>
      <Button
        text={isProcessing ? '处理中...' : '应用'}
        onClick={handleApply}
        intent="primary"
      />
    </div>
  );
});
const ImhistIcon = () => (
  <img 
    src="https://tse1-mm.cn.bing.net/th/id/OIP-C.Df-VPz22BDyyI0AduHeMzAHaHa?r=0&pid=ImgDet&w=474&h=474&rs=1"
    alt="黑白直方图均衡化图标" 
    style={{ width: '24px', height: '24px' }}
  />
);
export const ImHistSection = {
  name: 'imhist',
  Tab: (props) => (
    <SectionTab name="直方图均衡化" {...props}>
      <ImhistIcon />
    </SectionTab>
  ),
  Panel: ImHistPanel,
};