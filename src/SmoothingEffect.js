import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// 磨皮效果面板组件
export const SmoothingPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [strength, setStrength] = useState(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [algorithm, setAlgorithm] = useState('gaussian');
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
        <p>请选择一个图像来应用磨皮效果</p>
      </div>
    );
  }

  // 高斯模糊实现磨皮
  const applyGaussianBlur = (imageData, strength) => {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(pixels);

    const radius = Math.max(1, Math.floor(strength / 15)); // 根据强度调整半径
    const kernel = [];
    const kernelSize = radius * 2 + 1;
    const center = radius;
    const sigma = radius / 2;

    // 生成高斯内核
    let sum = 0;
    for (let y = 0; y < kernelSize; y++) {
      kernel[y] = [];
      for (let x = 0; x < kernelSize; x++) {
        const dx = x - center;
        const dy = y - center;
        const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        kernel[y][x] = value;
        sum += value;
      }
    }

    // 归一化内核
    for (let y = 0; y < kernelSize; y++) {
      for (let x = 0; x < kernelSize; x++) {
        kernel[y][x] /= sum;
      }
    }

    // 应用卷积
    for (let y = center; y < height - center; y++) {
      for (let x = center; x < width - center; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let sum = 0;

          for (let ky = 0; ky < kernelSize; ky++) {
            for (let kx = 0; kx < kernelSize; kx++) {
              const pixelY = y + ky - center;
              const pixelX = x + kx - center;
              const pixelIdx = (pixelY * width + pixelX) * 4 + c;
              sum += pixels[pixelIdx] * kernel[ky][kx];
            }
          }

          output[idx + c] = Math.max(0, Math.min(255, Math.round(sum)));
        }
        output[idx + 3] = pixels[idx + 3]; // 保持 alpha 通道
      }
    }

    imageData.data.set(output);
    return imageData;
  };

  // 双边滤波实现保边磨皮
  const applyBilateralFilter = (imageData, strength) => {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(pixels);

    const radius = Math.max(1, Math.floor(strength / 20));
    const sigmaSpace = radius;
    const sigmaColor = strength * 2; // 颜色差异敏感度

    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let weightSum = 0;
          let pixelSum = 0;
          const centerPixel = pixels[idx + c];

          for (let ky = -radius; ky <= radius; ky++) {
            for (let kx = -radius; kx <= radius; kx++) {
              const neighborY = y + ky;
              const neighborX = x + kx;
              const neighborIdx = (neighborY * width + neighborX) * 4 + c;
              const neighborPixel = pixels[neighborIdx];

              // 空间权重
              const spatialDistance = Math.sqrt(kx * kx + ky * ky);
              const spatialWeight = Math.exp(-(spatialDistance * spatialDistance) / (2 * sigmaSpace * sigmaSpace));

              // 颜色权重
              const colorDistance = Math.abs(centerPixel - neighborPixel);
              const colorWeight = Math.exp(-(colorDistance * colorDistance) / (2 * sigmaColor * sigmaColor));

              const weight = spatialWeight * colorWeight;
              weightSum += weight;
              pixelSum += neighborPixel * weight;
            }
          }

          output[idx + c] = Math.max(0, Math.min(255, Math.round(pixelSum / weightSum)));
        }
        output[idx + 3] = pixels[idx + 3]; // 保持 alpha 通道
      }
    }

    imageData.data.set(output);
    return imageData;
  };

  // 表面模糊
  const applySurfaceBlur = (imageData, strength) => {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(pixels);

    const radius = Math.max(1, Math.floor(strength / 25));
    const threshold = strength / 2; // 阈值

    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let count = 0;
          const centerPixel = pixels[idx + c];

          for (let ky = -radius; ky <= radius; ky++) {
            for (let kx = -radius; kx <= radius; kx++) {
              const neighborY = y + ky;
              const neighborX = x + kx;
              const neighborIdx = (neighborY * width + neighborX) * 4 + c;
              const neighborPixel = pixels[neighborIdx];

              // 只有相似的像素才参与平均
              if (Math.abs(centerPixel - neighborPixel) < threshold) {
                sum += neighborPixel;
                count++;
              }
            }
          }

          if (count > 0) {
            output[idx + c] = Math.max(0, Math.min(255, Math.round(sum / count)));
          } else {
            output[idx + c] = centerPixel;
          }
        }
        output[idx + 3] = pixels[idx + 3]; // 保持 alpha 通道
      }
    }

    imageData.data.set(output);
    return imageData;
  };

  const applySmoothing = async () => {
    if (!originalImageRef.current || strength === 0) return;

    setIsProcessing(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = originalImageRef.current;

      // 设置画布大小
      canvas.width = img.width;
      canvas.height = img.height;

      // 绘制原始图像
      ctx.drawImage(img, 0, 0);

      // 获取图像数据
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // 根据选择的算法应用磨皮
      let processedData;
      switch (algorithm) {
        case 'gaussian':
          processedData = applyGaussianBlur(imageData, strength);
          break;
        case 'bilateral':
          processedData = applyBilateralFilter(imageData, strength);
          break;
        case 'surface':
          processedData = applySurfaceBlur(imageData, strength);
          break;
        default:
          processedData = imageData;
      }

      // 将处理后的数据放回画布
      ctx.putImageData(processedData, 0, 0);

      // 将画布转换为 Blob
      canvas.toBlob((blob) => {
        if (blob) {
          // 创建新的图像 URL
          const url = URL.createObjectURL(blob);

          // 更新 Polotno 元素
          element.set({ src: url });

          // 保存磨皮参数
          element.set({
            customSmoothing: strength,
            customSmoothingAlgorithm: algorithm
          });
        }
      }, 'image/png');

    } catch (error) {
      console.error('磨皮处理失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetSmoothing = () => {
    if (originalImageRef.current) {
      element.set({
        src: originalImageRef.current.src,
        customSmoothing: 0,
        customSmoothingAlgorithm: 'gaussian'
      });
      setStrength(0);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginBottom: '20px' }}>图像磨皮</h3>

      <div style={{ marginBottom: '20px' }}>
        <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>磨皮算法：</p>
        <RadioGroup
          onChange={(e) => setAlgorithm(e.currentTarget.value)}
          selectedValue={algorithm}
        >
          <Radio label="高斯模糊" value="gaussian" />
          <Radio label="双边滤波 (保边)" value="bilateral" />
          <Radio label="表面模糊" value="surface" />
        </RadioGroup>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          磨皮强度: {strength}%
        </label>
        <Slider
          min={0}
          max={100}
          stepSize={1}
          value={strength}
          onChange={setStrength}
          labelStepSize={25}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Button
          onClick={applySmoothing}
          loading={isProcessing}
          intent="primary"
        >
          应用磨皮
        </Button>
        <Button
          onClick={resetSmoothing}
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
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>算法说明：</p>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>高斯模糊</strong>：经典的模糊算法，均匀处理整张图像</li>
          <li><strong>双边滤波</strong>：保持边缘清晰的同时进行磨皮，适合人像处理</li>
          <li><strong>表面模糊</strong>：只对相似像素进行平均，保持细节的同时去除噪点</li>
        </ul>
      </div>

      <div style={{ fontSize: '12px', color: '#666' }}>
        <p><strong>使用提示：</strong></p>
        <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
          <li>高斯模糊：适合快速磨皮，效果均匀</li>
          <li>双边滤波：适合人像磨皮，保持轮廓清晰</li>
          <li>表面模糊：适合去除噪点同时保持纹理细节</li>
        </ul>
      </div>

      {/* 隐藏的画布用于图像处理 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
});

// 自定义图标组件
const SmoothingIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" opacity="0.3"/>
    <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.6"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
  </svg>
);

// 导出磨皮效果的 SectionTab 配置
export const SmoothingSection = {
  name: 'smoothing',
  Tab: (props) => (
    <SectionTab name="磨皮" {...props}>
      <SmoothingIcon />
    </SectionTab>
  ),
  Panel: SmoothingPanel,
};