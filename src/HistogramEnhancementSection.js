import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio, Switch, FileInput } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// 直方图增强面板组件
export const HistogramEnhancementPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [isProcessing, setIsProcessing] = useState(false);
  const [enhanceType, setEnhanceType] = useState('equalization'); // equalization, stretching, matching
  const [showHistogram, setShowHistogram] = useState(true);
  const [referenceImage, setReferenceImage] = useState(null);
  const [contrastFactor, setContrastFactor] = useState(1.5);
  
  const canvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const processedHistogramCanvasRef = useRef(null);
  const originalImageRef = useRef(null);
  const referenceCanvasRef = useRef(null);
  
  // 当选中元素改变时，保存原始图像并绘制直方图
  useEffect(() => {
    if (element && element.type === 'image' && element.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        originalImageRef.current = img;
        if (showHistogram) {
          drawOriginalHistogram();
        }
      };
      img.src = element.src;
    }
  }, [element?.src]);
  
  // 绘制原始图像直方图
  const drawOriginalHistogram = () => {
    if (!originalImageRef.current || !histogramCanvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = originalImageRef.current;
    
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    drawHistogram(imageData, histogramCanvasRef.current, 'Original');
  };
  
  // 直方图均衡化
  const histogramEqualization = (imageData) => {
    const pixels = imageData.data;
    const L = 256;
    const histogram = new Array(L).fill(0);
    const totalPixels = pixels.length / 4;
    
    // 构造 HSL 的亮度分量并统计直方图
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const gray = Math.round(l * 255);
      histogram[gray]++;
    }
    
    // 计算累积分布函数 (CDF)
    const cdf = new Array(L).fill(0);
    let cumSum = 0;
    for (let i = 0; i < L; i++) {
      cumSum += histogram[i];
      cdf[i] = cumSum / totalPixels;
    }
    
    const mapping = cdf.map(p => p);
    
    // 替换亮度并转回 RGB
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      
      // RGB -> HSL
      let max = Math.max(r, g, b);
      let min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      
      if (max === min) {
        h = s = 0; // 灰色
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      
      // 均衡化后的亮度
      const originalGray = Math.round(l * 255);
      const newL = mapping[originalGray];
      
      // HSL -> RGB
      const newRGB = hslToRgb(h, s, newL);
      pixels[i] = newRGB[0];
      pixels[i + 1] = newRGB[1];
      pixels[i + 2] = newRGB[2];
    }
    
    return imageData;
  };
  
  // 辅助函数：HSL → RGB
  const hslToRgb = (h, s, l) => {
    let r, g, b;
    
    if (s === 0) {
      r = g = b = l; // 灰色
    } else {
      const hue2rgb = function(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };
  
  // 对比度拉伸
  const contrastStretching = (imageData) => {
    const pixels = imageData.data;
    let minL = 1, maxL = 0;
    
    // 获取亮度范围（HSL中的L分量）
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
    
    // 避免除零错误
    if (maxL === minL) return imageData;
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      
      // RGB -> HSL
      let max = Math.max(r, g, b);
      let min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      
      if (max === min) {
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      
      // 拉伸亮度
      const newL = (l - minL) / (maxL - minL);
      const newRGB = hslToRgb(h, s, newL);
      pixels[i] = newRGB[0];
      pixels[i + 1] = newRGB[1];
      pixels[i + 2] = newRGB[2];
    }
    
    return imageData;
  };
  
  // 彩色图像直方图匹配
  const histogramMatchColor = (sourceData, referenceData) => {
    const computeHistogram = (channelData) => {
      const hist = new Array(256).fill(0);
      channelData.forEach(value => hist[value]++);
      return hist;
    };
    
    const computeCDF = (hist) => {
      const cdf = [];
      let sum = 0;
      const total = hist.reduce((a, b) => a + b, 0);
      for (let i = 0; i < hist.length; i++) {
        sum += hist[i];
        cdf[i] = sum / total;
      }
      return cdf;
    };
    
    const buildMapping = (srcCDF, refCDF) => {
      const mapping = new Array(256);
      for (let i = 0; i < 256; i++) {
        let j = 0;
        while (j < 255 && refCDF[j] < srcCDF[i]) {
          j++;
        }
        mapping[i] = j;
      }
      return mapping;
    };
    
    // 拆分通道
    const srcR = [], srcG = [], srcB = [];
    const refR = [], refG = [], refB = [];
    for (let i = 0; i < sourceData.length; i += 4) {
      srcR.push(sourceData[i]);
      srcG.push(sourceData[i + 1]);
      srcB.push(sourceData[i + 2]);
      
      if (i < referenceData.length) {
        refR.push(referenceData[i]);
        refG.push(referenceData[i + 1]);
        refB.push(referenceData[i + 2]);
      }
    }
    
    // 如果参考图像较小，重复使用数据
    while (refR.length < srcR.length) {
      const shortage = srcR.length - refR.length;
      const copyLength = Math.min(shortage, refR.length);
      refR.push(...refR.slice(0, copyLength));
      refG.push(...refG.slice(0, copyLength));
      refB.push(...refB.slice(0, copyLength));
    }
    
    // 计算各通道直方图 & CDF
    const srcCDF_R = computeCDF(computeHistogram(srcR));
    const refCDF_R = computeCDF(computeHistogram(refR));
    const mappingR = buildMapping(srcCDF_R, refCDF_R);
    
    const srcCDF_G = computeCDF(computeHistogram(srcG));
    const refCDF_G = computeCDF(computeHistogram(refG));
    const mappingG = buildMapping(srcCDF_G, refCDF_G);
    
    const srcCDF_B = computeCDF(computeHistogram(srcB));
    const refCDF_B = computeCDF(computeHistogram(refB));
    const mappingB = buildMapping(srcCDF_B, refCDF_B);
    
    // 生成新图像数据（每个通道分别匹配）
    const result = new Uint8ClampedArray(sourceData.length);
    for (let i = 0; i < sourceData.length; i += 4) {
      result[i] = mappingR[sourceData[i]];
      result[i + 1] = mappingG[sourceData[i + 1]];
      result[i + 2] = mappingB[sourceData[i + 2]];
      result[i + 3] = sourceData[i + 3]; // alpha
    }
    
    return result;
  };
  
  // 直方图绘图函数
  const drawHistogram = (imageData, canvas, title) => {
    if (!canvas) return;
    
    const pixels = imageData.data;
    const histogram = new Array(256).fill(0);
    
    // 计算亮度直方图
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      histogram[gray]++;
    }
    
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 150;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const maxCount = Math.max(...histogram);
    if (maxCount === 0) return;
    
    const barWidth = canvas.width / 256;
    
    // 绘制直方图
    for (let i = 0; i < 256; i++) {
      const barHeight = (histogram[i] / maxCount) * (canvas.height - 20);
      ctx.fillStyle = '#4285f4';
      ctx.fillRect(i * barWidth, canvas.height - barHeight - 20, barWidth, barHeight);
    }
    
    // 绘制标题
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, canvas.width / 2, canvas.height - 5);
  };
  
  // 应用直方图增强
  const applyHistogramEnhancement = async () => {
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
      
      // 根据选择的类型应用不同的增强
      switch (enhanceType) {
        case 'equalization':
          imageData = histogramEqualization(imageData);
          break;
          
        case 'stretching':
          imageData = contrastStretching(imageData);
          break;
          
        case 'matching':
          if (referenceImage) {
            const refCanvas = referenceCanvasRef.current;
            const refCtx = refCanvas.getContext('2d');
            refCanvas.width = referenceImage.width;
            refCanvas.height = referenceImage.height;
            refCtx.drawImage(referenceImage, 0, 0);
            
            const refImageData = refCtx.getImageData(0, 0, refCanvas.width, refCanvas.height);
            const matchedData = histogramMatchColor(imageData.data, refImageData.data);
            imageData.data.set(matchedData);
          } else {
            throw new Error('请先选择参考图像');
          }
          break;
          
        default:
          throw new Error('未知的增强类型');
      }
      
      // 将处理后的数据放回画布
      ctx.putImageData(imageData, 0, 0);
      
      // 绘制处理后的直方图
      if (showHistogram && processedHistogramCanvasRef.current) {
        drawHistogram(imageData, processedHistogramCanvasRef.current, 'Enhanced');
      }
      
      // 将画布转换为 Blob
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          element.set({ src: url });
          
          // 保存处理参数
          element.set({
            customHistogramEnhancement: enhanceType,
            customHistogramProcessed: true
          });
        }
      }, 'image/png');
      
    } catch (error) {
      console.error('直方图增强失败:', error);
      alert('处理失败: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // 重置处理
  const resetEnhancement = () => {
    if (originalImageRef.current) {
      element.set({
        src: originalImageRef.current.src,
        customHistogramEnhancement: null,
        customHistogramProcessed: false
      });
      
      if (showHistogram) {
        drawOriginalHistogram();
        if (processedHistogramCanvasRef.current) {
          const ctx = processedHistogramCanvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, processedHistogramCanvasRef.current.width, processedHistogramCanvasRef.current.height);
        }
      }
    }
  };
  
  // 处理参考图像上传
  const handleReferenceImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setReferenceImage(img);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };
  
  if (!element || element.type !== 'image') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>请选择一个图像来应用直方图增强</p>
      </div>
    );
  }
  
  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginBottom: '20px' }}>直方图增强</h3>
      
      {/* 增强类型选择 */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>增强类型：</p>
        <RadioGroup
          onChange={(e) => setEnhanceType(e.currentTarget.value)}
          selectedValue={enhanceType}
        >
          <Radio label="直方图均衡化" value="equalization" />
          <Radio label="对比度拉伸" value="stretching" />
          <Radio label="直方图匹配" value="matching" />
        </RadioGroup>
      </div>
      
      {/* 参考图像上传（仅在直方图匹配时显示） */}
      {enhanceType === 'matching' && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>选择参考图像：</p>
          <FileInput
            text={referenceImage ? "已选择参考图像" : "选择参考图像"}
            onInputChange={handleReferenceImageUpload}
            inputProps={{ accept: 'image/*' }}
          />
          {referenceImage && (
            <div style={{ marginTop: '10px', textAlign: 'center' }}>
              <img 
                src={referenceImage.src} 
                alt="Reference" 
                style={{ 
                  maxWidth: '100px', 
                  maxHeight: '100px', 
                  border: '1px solid #ccc',
                  borderRadius: '4px'
                }}
              />
            </div>
          )}
        </div>
      )}
      
      {/* 显示直方图选项 */}
      <div style={{ marginBottom: '20px' }}>
        <Switch
          checked={showHistogram}
          label="显示直方图"
          onChange={(e) => {
            setShowHistogram(e.currentTarget.checked);
            if (e.currentTarget.checked && originalImageRef.current) {
              setTimeout(drawOriginalHistogram, 100);
            }
          }}
        />
      </div>
      
      {/* 直方图显示 */}
      {showHistogram && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '10px' }}>
            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', fontSize: '12px' }}>原始直方图：</p>
            <canvas 
              ref={histogramCanvasRef}
              style={{ 
                width: '100%', 
                maxWidth: '256px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
          </div>
          
          <div>
            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', fontSize: '12px' }}>增强后直方图：</p>
            <canvas 
              ref={processedHistogramCanvasRef}
              style={{ 
                width: '100%', 
                maxWidth: '256px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
          </div>
        </div>
      )}
      
      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Button 
          onClick={applyHistogramEnhancement}
          loading={isProcessing}
          intent="primary"
        >
          应用增强
        </Button>
        <Button 
          onClick={resetEnhancement}
          disabled={!originalImageRef.current}
        >
          重置
        </Button>
      </div>
      
      {/* 算法说明 */}
      <div style={{ 
        backgroundColor: '#f5f5f5', 
        padding: '15px', 
        borderRadius: '5px',
        marginBottom: '15px',
        fontSize: '12px'
      }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>算法说明：</p>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>直方图均衡化</strong>：使图像的直方图分布更加均匀，增强整体对比度</li>
          <li><strong>对比度拉伸</strong>：将图像的亮度范围拉伸到全动态范围，增强对比度</li>
          <li><strong>直方图匹配</strong>：使目标图像的直方图匹配参考图像的直方图分布</li>
        </ul>
      </div>
      
      {/* 使用提示 */}
      <div style={{ fontSize: '12px', color: '#666' }}>
        <p><strong>使用提示：</strong></p>
        <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
          <li>直方图均衡化：适合整体偏暗或偏亮的图像</li>
          <li>对比度拉伸：适合对比度不足的图像</li>
          <li>直方图匹配：适合需要统一色调风格的图像处理</li>
        </ul>
      </div>
      
      {/* 隐藏的画布 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={referenceCanvasRef} style={{ display: 'none' }} />
    </div>
  );
});

// 自定义图标组件
const HistogramIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M3 18h18v2H3v-2zM3 14h2v4H3v-4zm4-4h2v8H7v-8zm4-4h2v12h-2V6zm4 2h2v10h-2V8zm4-6h2v16h-2V2z" />
  </svg>
);

// 导出直方图增强的 SectionTab 配置
export const HistogramEnhancementSection = {
  name: 'histogram-enhancement',
  Tab: (props) => (
    <SectionTab name="直方图增强" {...props}>
      <HistogramIcon />
    </SectionTab>
  ),
  Panel: HistogramEnhancementPanel,
};