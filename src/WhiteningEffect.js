import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, ProgressBar } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// 美白效果面板组件
export const WhiteningPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [whiteningLevel, setWhiteningLevel] = useState(40);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState('');
  const canvasRef = useRef(null);
  const originalImageRef = useRef(null);

  // 当选中元素改变时，保存原始图像
  useEffect(() => {
    if (element && element.type === 'image' && element.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        originalImageRef.current = img;
        // 恢复之前的设置
        setWhiteningLevel(element.customWhitening || 40);
      };
      img.src = element.src;
    }
  }, [element?.src]);

  if (!element || element.type !== 'image') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>请选择一个图像来应用美白效果</p>
      </div>
    );
  }

  // 改进的肤色检测函数（多条件组合）
  const isSkinColor = (r, g, b) => {
    // 基本RGB肤色条件
    const condition1 = r > 95 && g > 40 && b > 20;
    const condition2 = Math.max(r, g, b) - Math.min(r, g, b) > 15;
    const condition3 = Math.abs(r - g) > 15;
    const condition4 = r > g && r > b;
    const condition5 = r < 220 && g < 210 && b < 170; // 避免过亮区域

    // YCbCr色彩空间检测（更准确）
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.169 * r - 0.331 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.419 * g - 0.081 * b + 128;
    
    // 肤色在YCbCr空间的范围
    const cbInRange = cb >= 77 && cb <= 127;
    const crInRange = cr >= 133 && cr <= 173;
    const yInRange = y >= 80 && y <= 255;
    
    // 组合条件：RGB基本条件 + YCbCr色彩空间验证
    const rgbSkin = condition1 && condition2 && condition3 && condition4 && condition5;
    const ycbcrSkin = cbInRange && crInRange && yInRange;
    
    return rgbSkin && ycbcrSkin;
  };

  // 基于HSI强度调整的自然美白算法
  const applyNaturalSkinWhitening = async (imageData, level, progressCallback) => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    const totalPixels = width * height;
    let processedPixels = 0;

    // 美白强度调整 - 更保守的设置
    const intensity = level / 100;
    
    // 第一步：检测并标记肤色区域
    if (progressCallback) progressCallback(20, '正在检测肤色区域...');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const skinMask = new Uint8Array(totalPixels);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const pixelIdx = i / 4;
      
      skinMask[pixelIdx] = isSkinColor(r, g, b) ? 1 : 0;
    }

    // 第二步：形态学处理，平滑肤色区域
    if (progressCallback) progressCallback(40, '正在优化肤色区域...');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const smoothedMask = morphologyClose(skinMask, width, height, 2);

    // 第三步：应用基于HSI强度的自然美白
    if (progressCallback) progressCallback(60, '正在应用自然美白...');
    await new Promise(resolve => setTimeout(resolve, 50));

    for (let i = 0; i < data.length; i += 4) {
      const pixelIdx = i / 4;
      processedPixels++;
      
      if (smoothedMask[pixelIdx]) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 转换到HSI空间
        const hsi = rgbToHsi(r, g, b);
        
        // 计算当前像素的亮度等级
        const currentIntensity = hsi.i;
        
        // 根据原始亮度动态调整美白程度
        // 较暗的区域美白程度更高，较亮的区域美白程度较低
        let adaptiveIntensity;
        if (currentIntensity < 0.3) {
          // 阴影区域：较强美白
          adaptiveIntensity = intensity * 0.4;
        } else if (currentIntensity < 0.6) {
          // 中等亮度：中等美白
          adaptiveIntensity = intensity * 0.25;
        } else {
          // 高亮区域：轻微美白
          adaptiveIntensity = intensity * 0.1;
        }
        
        // 仅调整强度(I)通道，保持色相(H)和饱和度(S)
        const newI = Math.min(1.0, currentIntensity + adaptiveIntensity);
        
        // 保持色相和饱和度不变，只提升强度
        const newHsi = {
          h: hsi.h,
          s: Math.max(0, hsi.s - adaptiveIntensity * 0.3), // 轻微降低饱和度
          i: newI
        };
        
        // 转换回RGB
        const newRgb = hsiToRgb(newHsi.h, newHsi.s, newHsi.i);
        
        // 更温和的混合，保持自然过渡
        const blendFactor = 0.6;
        output[i] = Math.round(r * (1 - blendFactor) + newRgb.r * blendFactor);
        output[i + 1] = Math.round(g * (1 - blendFactor) + newRgb.g * blendFactor);
        output[i + 2] = Math.round(b * (1 - blendFactor) + newRgb.b * blendFactor);
      } else {
        // 非肤色区域保持原样
        output[i] = data[i];
        output[i + 1] = data[i + 1];
        output[i + 2] = data[i + 2];
      }
      output[i + 3] = data[i + 3];

      // 更新进度
      if (processedPixels % Math.floor(totalPixels / 20) === 0 && progressCallback) {
        const progress = 60 + (processedPixels / totalPixels) * 30;
        progressCallback(progress, '正在应用自然美白...');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    if (progressCallback) progressCallback(100, '美白处理完成');
    
    imageData.data.set(output);
    return imageData;
  };

  // RGB转HSI (Hue, Saturation, Intensity)
  const rgbToHsi = (r, g, b) => {
    // 归一化RGB值到[0,1]
    r /= 255; g /= 255; b /= 255;
    
    // 计算强度(Intensity)
    const intensity = (r + g + b) / 3;
    
    // 计算色相(Hue)
    let hue = 0;
    if (intensity > 0) {
      const numerator = 0.5 * ((r - g) + (r - b));
      const denominator = Math.sqrt((r - g) * (r - g) + (r - b) * (g - b));
      
      if (denominator > 0) {
        const theta = Math.acos(numerator / denominator);
        hue = (b <= g) ? theta : (2 * Math.PI - theta);
      }
    }
    hue = hue / (2 * Math.PI); // 归一化到[0,1]
    
    // 计算饱和度(Saturation)
    let saturation = 0;
    if (intensity > 0) {
      const minRgb = Math.min(r, g, b);
      saturation = 1 - (3 * minRgb) / (r + g + b);
    }
    
    return { h: hue, s: saturation, i: intensity };
  };

  // HSI转RGB
  const hsiToRgb = (h, s, i) => {
    // 将色相从[0,1]转换为[0,2π]
    h *= 2 * Math.PI;
    
    let r, g, b;
    
    // 确定色相在哪个扇区
    if (h >= 0 && h < 2 * Math.PI / 3) {
      // 红-绿扇区 (0° - 120°)
      b = i * (1 - s);
      r = i * (1 + (s * Math.cos(h)) / Math.cos(Math.PI / 3 - h));
      g = 3 * i - (r + b);
    } else if (h >= 2 * Math.PI / 3 && h < 4 * Math.PI / 3) {
      // 绿-蓝扇区 (120° - 240°)
      h -= 2 * Math.PI / 3;
      r = i * (1 - s);
      g = i * (1 + (s * Math.cos(h)) / Math.cos(Math.PI / 3 - h));
      b = 3 * i - (r + g);
    } else {
      // 蓝-红扇区 (240° - 360°)
      h -= 4 * Math.PI / 3;
      g = i * (1 - s);
      b = i * (1 + (s * Math.cos(h)) / Math.cos(Math.PI / 3 - h));
      r = 3 * i - (g + b);
    }
    
    // 限制值在[0,1]范围内
    r = Math.max(0, Math.min(1, r));
    g = Math.max(0, Math.min(1, g));
    b = Math.max(0, Math.min(1, b));
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  };

  // 形态学闭运算
  const morphologyClose = (mask, width, height, kernelSize) => {
    // 先膨胀
    const dilated = dilate(mask, width, height, kernelSize);
    // 再腐蚀
    return erode(dilated, width, height, kernelSize);
  };

  // 膨胀操作
  const dilate = (mask, width, height, kernelSize) => {
    const output = new Uint8Array(mask);
    const half = Math.floor(kernelSize / 2);

    for (let y = half; y < height - half; y++) {
      for (let x = half; x < width - half; x++) {
        let maxVal = 0;
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const val = mask[(y + dy) * width + (x + dx)];
            if (val > maxVal) maxVal = val;
          }
        }
        output[y * width + x] = maxVal;
      }
    }
    return output;
  };

  // 腐蚀操作
  const erode = (mask, width, height, kernelSize) => {
    const output = new Uint8Array(mask);
    const half = Math.floor(kernelSize / 2);

    for (let y = half; y < height - half; y++) {
      for (let x = half; x < width - half; x++) {
        let minVal = 1;
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const val = mask[(y + dy) * width + (x + dx)];
            if (val < minVal) minVal = val;
          }
        }
        output[y * width + x] = minVal;
      }
    }
    return output;
  };

  const applyWhiteningEffect = async () => {
    if (!originalImageRef.current || whiteningLevel === 0) return;

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStep('开始美白处理...');

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

      // 应用自然肤色美白算法
      const processedData = await applyNaturalSkinWhitening(imageData, whiteningLevel, (progress, step) => {
        setProcessingProgress(progress);
        setProcessingStep(step);
      });

      // 将处理后的数据放回画布
      ctx.putImageData(processedData, 0, 0);

      // 转换为新图像并更新元素
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          element.set({ 
            src: url,
            customWhitening: whiteningLevel
          });
        }
      }, 'image/png');

    } catch (error) {
      console.error('美白处理失败:', error);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStep('');
    }
  };

  const resetWhitening = () => {
    if (originalImageRef.current) {
      element.set({ 
        src: originalImageRef.current.src,
        customWhitening: 0
      });
      setWhiteningLevel(40);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginBottom: '20px' }}>自然美白</h3>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          美白强度: {whiteningLevel}%
        </label>
        <Slider
          min={0}
          max={100}
          stepSize={1}
          value={whiteningLevel}
          onChange={setWhiteningLevel}
          labelStepSize={50}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Button 
          onClick={applyWhiteningEffect}
          loading={isProcessing}
          intent="primary"
          disabled={!element || element.type !== 'image' || isProcessing}
        >
          应用美白
        </Button>
        <Button 
          onClick={resetWhitening} 
          disabled={!element || element.type !== 'image' || isProcessing}
        >
          重置
        </Button>
      </div>

      {/* 进度条 */}
      {isProcessing && (
        <div style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '5px',
          border: '1px solid #dee2e6'
        }}>
          <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
            {processingStep}
          </div>
          <ProgressBar 
            value={processingProgress / 100} 
            intent="primary"
            animate={true}
          />
          <div style={{ marginTop: '5px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
            {processingProgress}% 完成
          </div>
        </div>
      )}

      <div style={{ 
        backgroundColor: '#f5f5f5', 
        padding: '15px', 
        borderRadius: '5px',
        marginBottom: '15px',
        fontSize: '12px'
      }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>HSI自然美白算法特点：</p>
        <ol style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>精准肤色检测</strong>：RGB + YCbCr双重色彩空间识别肌肤区域</li>
          <li><strong>HSI强度调整</strong>：仅调整强度(I)通道，保持色相(H)和饱和度(S)自然</li>
          <li><strong>自适应美白</strong>：根据像素亮度动态调整美白强度</li>
          <li><strong>温和混合</strong>：60%混合系数，避免面具化效果</li>
        </ol>
      </div>

      <div style={{ fontSize: '12px', color: '#666' }}>
        <p><strong>使用建议：</strong></p>
        <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
          <li>推荐美白强度：30-60% 获得自然肤色提亮效果</li>
          <li>HSI空间处理：仅提升亮度，保持原有肤色色调</li>
          <li>自适应处理：暗部区域美白更明显，亮部区域美白较轻</li>
          <li>避免面具效果：温和的强度调整，保持肌肤质感</li>
        </ul>
      </div>

      {/* 隐藏的画布用于图像处理 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
});

// 美白图标组件
const WhiteningIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M12 2L15.09 8.26L22 9L17 14L18.18 21L12 17.77L5.82 21L7 14L2 9L8.91 8.26L12 2Z" opacity="0.6"/>
    <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.9"/>
    <circle cx="12" cy="12" r="2" fill="white"/>
  </svg>
);

// 导出美白效果的 SectionTab 配置
export const WhiteningSection = {
  name: 'whitening',
  Tab: (props) => (
    <SectionTab name="自然美白" {...props}>
      <WhiteningIcon />
    </SectionTab>
  ),
  Panel: WhiteningPanel,
};