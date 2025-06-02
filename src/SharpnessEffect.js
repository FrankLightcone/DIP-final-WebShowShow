import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// 锐化效果面板组件
export const SharpnessPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [sharpness, setSharpness] = useState(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [algorithm, setAlgorithm] = useState('laplacian');
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
        <p>请选择一个图像来应用锐化效果</p>
      </div>
    );
  }
  
  // 拉普拉斯算子锐化
  const applyLaplacianSharpening = (imageData, strength) => {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(pixels);
    
    // 拉普拉斯核心（增强版）
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];
    
    // 调整核心强度
    const factor = strength / 100;
    const adjustedKernel = kernel.map((val, idx) => {
      if (idx === 4) return 1 + (val - 1) * factor; // 中心值
      return val * factor;
    });
    
    // 应用卷积
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let kernelIdx = 0;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixelIdx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += pixels[pixelIdx] * adjustedKernel[kernelIdx];
              kernelIdx++;
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
  
  // Sobel 算子锐化
  const applySobelSharpening = (imageData, strength) => {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(pixels);
    
    // Sobel 算子
    const sobelX = [
      -1, 0, 1,
      -2, 0, 2,
      -1, 0, 1
    ];
    
    const sobelY = [
      -1, -2, -1,
      0, 0, 0,
      1, 2, 1
    ];
    
    const factor = strength / 100;
    
    // 应用 Sobel 边缘检测并与原图混合
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        for (let c = 0; c < 3; c++) {
          let gx = 0;
          let gy = 0;
          let kernelIdx = 0;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixelIdx = ((y + ky) * width + (x + kx)) * 4 + c;
              gx += pixels[pixelIdx] * sobelX[kernelIdx];
              gy += pixels[pixelIdx] * sobelY[kernelIdx];
              kernelIdx++;
            }
          }
          
          // 计算梯度幅度
          const magnitude = Math.sqrt(gx * gx + gy * gy);
          
          // 混合原始像素和边缘
          const original = pixels[idx + c];
          const sharpened = original + magnitude * factor * 0.5;
          
          output[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
        }
        output[idx + 3] = pixels[idx + 3]; // 保持 alpha 通道
      }
    }
    
    imageData.data.set(output);
    return imageData;
  };
  
  // 高斯锐化（Unsharp Mask）
  const applyUnsharpMask = (imageData, strength) => {
    const pixels = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(pixels);
    
    // 首先应用高斯模糊
    const blurred = new Uint8ClampedArray(pixels);
    const gaussianKernel = [
      1/16, 2/16, 1/16,
      2/16, 4/16, 2/16,
      1/16, 2/16, 1/16
    ];
    
    // 应用高斯模糊
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let kernelIdx = 0;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixelIdx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += pixels[pixelIdx] * gaussianKernel[kernelIdx];
              kernelIdx++;
            }
          }
          
          blurred[idx + c] = Math.round(sum);
        }
      }
    }
    
    // 计算锐化：原图 + (原图 - 模糊图) * 强度
    const factor = strength / 50; // 调整强度范围
    
    for (let i = 0; i < pixels.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const original = pixels[i + c];
        const blur = blurred[i + c];
        const sharpened = original + (original - blur) * factor;
        output[i + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
      }
      output[i + 3] = pixels[i + 3]; // 保持 alpha 通道
    }
    
    imageData.data.set(output);
    return imageData;
  };
  
  const applySharpness = async () => {
    if (!originalImageRef.current || sharpness === 0) return;
    
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
      
      // 根据选择的算法应用锐化
      let processedData;
      switch (algorithm) {
        case 'laplacian':
          processedData = applyLaplacianSharpening(imageData, sharpness);
          break;
        case 'sobel':
          processedData = applySobelSharpening(imageData, sharpness);
          break;
        case 'unsharp':
          processedData = applyUnsharpMask(imageData, sharpness);
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
          
          // 保存锐化参数
          element.set({
            customSharpness: sharpness,
            customSharpnessAlgorithm: algorithm
          });
        }
      }, 'image/png');
      
    } catch (error) {
      console.error('锐化处理失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const resetSharpness = () => {
    if (originalImageRef.current) {
      element.set({ 
        src: originalImageRef.current.src,
        customSharpness: 0,
        customSharpnessAlgorithm: 'laplacian'
      });
      setSharpness(0);
    }
  };
  
  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginBottom: '20px' }}>图像锐化</h3>
      
      <div style={{ marginBottom: '20px' }}>
        <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>锐化算法：</p>
        <RadioGroup
          onChange={(e) => setAlgorithm(e.currentTarget.value)}
          selectedValue={algorithm}
        >
          <Radio label="拉普拉斯算子" value="laplacian" />
          <Radio label="Sobel 算子" value="sobel" />
          <Radio label="高斯锐化 (Unsharp Mask)" value="unsharp" />
        </RadioGroup>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          锐化强度: {sharpness}%
        </label>
        <Slider
          min={0}
          max={100}
          stepSize={1}
          value={sharpness}
          onChange={setSharpness}
          labelStepSize={25}
        />
      </div>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Button 
          onClick={applySharpness}
          loading={isProcessing}
          intent="primary"
        >
          应用锐化
        </Button>
        <Button 
          onClick={resetSharpness} 
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
          <li><strong>拉普拉斯算子</strong>：经典的二阶导数边缘检测，增强图像细节</li>
          <li><strong>Sobel 算子</strong>：一阶导数边缘检测，计算梯度幅度来增强边缘</li>
          <li><strong>高斯锐化</strong>：通过减去模糊版本来增强细节，效果更自然</li>
        </ul>
      </div>
      
      <div style={{ fontSize: '12px', color: '#666' }}>
        <p><strong>使用提示：</strong></p>
        <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
          <li>拉普拉斯算子：适合需要强烈细节增强的图像</li>
          <li>Sobel 算子：适合增强边缘轮廓</li>
          <li>高斯锐化：适合自然照片，效果相对柔和</li>
        </ul>
      </div>
      
      {/* 隐藏的画布用于图像处理 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
});

// 自定义图标组件
const SharpnessIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M12 2l2 2-2 2-2-2 2-2zm0 4l4 4-4 4-4-4 4-4zm0 4l2 2-2 2-2-2 2-2zm-8 2l2-2 2 2-2 2-2-2zm12 0l2-2 2 2-2 2-2-2zm-4 4l2 2-2 2-2-2 2-2zm0 4l4 4-4 4-4-4 4-4zm0 4l2 2-2 2-2-2 2-2z" opacity="0.8"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
  </svg>
);

// 导出锐化效果的 SectionTab 配置
export const SharpnessSection = {
  name: 'sharpness',
  Tab: (props) => (
    <SectionTab name="锐化" {...props}>
      <SharpnessIcon />
    </SectionTab>
  ),
  Panel: SharpnessPanel,
};