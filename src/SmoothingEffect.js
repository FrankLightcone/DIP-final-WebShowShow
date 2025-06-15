import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio, Switch, Collapse, ProgressBar } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// 专业磨皮美颜面板组件
export const SmoothingPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // 美颜参数
  const [beautyParams, setBeautyParams] = useState({
    // 双边滤波参数
    bilateralStrength: 75,
    sigmaSpace: 8,
    sigmaColor: 40,
    
    // 肤色检测参数
    skinDetection: true,
    skinSensitivity: 50,
    
    // 图像锐化参数
    sharpenStrength: 30,
    
    // 美白参数
    whitenStrength: 20,
    
    // 整体强度
    overallStrength: 75
  });

  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const originalImageRef = useRef(null);

  // 当选中元素改变时，保存原始图像
  useEffect(() => {
    if (element && element.type === 'image' && element.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        originalImageRef.current = img;
        // 重置参数
        if (element.beautyParams) {
          setBeautyParams(element.beautyParams);
        }
      };
      img.src = element.src;
    }
  }, [element?.src]);

  if (!element || element.type !== 'image') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>请选择一个图像来应用磨皮美颜效果</p>
      </div>
    );
  }

  // 改进的双边滤波实现
  const bilateralFilter = (imageData, sigmaSpace, sigmaColor) => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    const win = Math.min(7, Math.max(3, Math.round(sigmaSpace))); // 动态窗口大小，3-7像素
    const sigmaColorNorm = sigmaColor * 2.55; // 将0-100映射到0-255

    // 预计算空间权重
    const spatialWeights = [];
    for (let dy = -win; dy <= win; dy++) {
      spatialWeights[dy + win] = [];
      for (let dx = -win; dx <= win; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        spatialWeights[dy + win][dx + win] = Math.exp(-(distance * distance) / (2 * sigmaSpace * sigmaSpace));
      }
    }

    for (let y = win; y < height - win; y++) {
      for (let x = win; x < width - win; x++) {
        const centerIdx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let weightSum = 0;
          let pixelSum = 0;
          const centerPixel = data[centerIdx + c];

          for (let dy = -win; dy <= win; dy++) {
            for (let dx = -win; dx <= win; dx++) {
              const neighborY = y + dy;
              const neighborX = x + dx;
              const neighborIdx = (neighborY * width + neighborX) * 4 + c;
              const neighborPixel = data[neighborIdx];

              // 空间权重
              const spatialWeight = spatialWeights[dy + win][dx + win];

              // 改进的颜色权重计算
              const colorDiff = Math.abs(centerPixel - neighborPixel);
              const colorWeight = Math.exp(-(colorDiff * colorDiff) / (2 * sigmaColorNorm * sigmaColorNorm));

              const weight = spatialWeight * colorWeight;
              weightSum += weight;
              pixelSum += neighborPixel * weight;
            }
          }

          output[centerIdx + c] = Math.round(pixelSum / weightSum);
        }
      }
    }

    return new ImageData(output, width, height);
  };

  // 改进的RGB空间肤色过滤
  const firstSkinFilter = (imageData) => {
    const { data, width, height } = imageData;
    const mask = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const pixelIdx = i / 4;

      // 改进的RGB肤色检测条件
      const maxRGB = Math.max(r, g, b);
      const minRGB = Math.min(r, g, b);
      
      // 基本肤色判断条件
      const condition1 = r > 95 && g > 40 && b > 20; // 基本颜色范围
      const condition2 = maxRGB - minRGB > 15; // 颜色对比度
      const condition3 = Math.abs(r - g) > 15; // R-G差异
      const condition4 = r > g && r > b; // 红色占主导
      const condition5 = r < 220 && g < 210 && b < 170; // 避免过亮区域

      if (condition1 && condition2 && condition3 && condition4 && condition5) {
        mask[pixelIdx] = 1; // 肤色
      } else {
        mask[pixelIdx] = 0; // 非肤色
      }
    }

    return mask;
  };

  // 改进的YCgCr空间肤色检测
  const ycgcrSkinDetection = (imageData, sensitivity) => {
    const { data, width, height } = imageData;
    const mask = new Uint8Array(width * height);
    const threshold = sensitivity / 100;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const pixelIdx = i / 4;

      // 正确的RGB to YCgCr转换
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cg = -0.169 * r - 0.331 * g + 0.5 * b + 128;
      const cr = 0.5 * r - 0.419 * g - 0.081 * b + 128;

      // 动态阈值范围（根据敏感度调整）
      const cgRange = 15 + threshold * 10; // 基础范围15，最大25
      const crRange = 20 + threshold * 15; // 基础范围20，最大35
      
      const cgCenter = 120;
      const crCenter = 152;

      // 椭圆形肤色区域检测
      const cgNorm = (cg - cgCenter) / cgRange;
      const crNorm = (cr - crCenter) / crRange;
      const distance = cgNorm * cgNorm + crNorm * crNorm;

      if (distance <= 1.0 && y > 40 && y < 230) { // 亮度范围限制
        mask[pixelIdx] = 1; // 肤色
      } else {
        mask[pixelIdx] = 0; // 非肤色
      }
    }

    // 形态学开运算去噪
    return morphologyOpen(mask, width, height, 2);
  };

  // 形态学腐蚀
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

  // 形态学膨胀
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

  // 形态学开运算（先腐蚀后膨胀）
  const morphologyOpen = (mask, width, height, kernelSize) => {
    const eroded = erode(mask, width, height, kernelSize);
    return dilate(eroded, width, height, kernelSize);
  };

  // 改进的图像融合（带边缘保护）
  const fuseImages = (originalData, filteredData, skinMask, strength) => {
    const output = new Uint8ClampedArray(originalData.data);
    const blendFactor = strength / 100;
    const { width, height } = originalData;

    // 计算边缘强度
    const edgeStrength = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const centerIdx = idx * 4;
        
        // Sobel边缘检测
        let gx = 0, gy = 0;
        for (let c = 0; c < 3; c++) {
          // X方向梯度
          gx += originalData.data[centerIdx - 4 + c] * -1 +
                originalData.data[centerIdx + 4 + c] * 1 +
                originalData.data[centerIdx - width * 4 - 4 + c] * -1 +
                originalData.data[centerIdx - width * 4 + 4 + c] * 1 +
                originalData.data[centerIdx + width * 4 - 4 + c] * -1 +
                originalData.data[centerIdx + width * 4 + 4 + c] * 1;
          
          // Y方向梯度
          gy += originalData.data[centerIdx - width * 4 - 4 + c] * -1 +
                originalData.data[centerIdx - width * 4 + c] * -2 +
                originalData.data[centerIdx - width * 4 + 4 + c] * -1 +
                originalData.data[centerIdx + width * 4 - 4 + c] * 1 +
                originalData.data[centerIdx + width * 4 + c] * 2 +
                originalData.data[centerIdx + width * 4 + 4 + c] * 1;
        }
        
        edgeStrength[idx] = Math.sqrt(gx * gx + gy * gy) / 3; // 归一化
      }
    }

    for (let i = 0; i < originalData.data.length; i += 4) {
      const pixelIdx = i / 4;
      
      if (skinMask[pixelIdx]) {
        // 根据边缘强度调整混合程度
        const edgeWeight = Math.min(1, edgeStrength[pixelIdx] / 100); // 边缘权重
        const adaptiveBlend = blendFactor * (1 - edgeWeight * 0.7); // 边缘处减少混合
        
        // 肤色区域：融合原图和滤波后的图像
        for (let c = 0; c < 3; c++) {
          const original = originalData.data[i + c];
          const filtered = filteredData.data[i + c];
          output[i + c] = Math.round(original * (1 - adaptiveBlend) + filtered * adaptiveBlend);
        }
      } else {
        // 非肤色区域：保持原图
        for (let c = 0; c < 3; c++) {
          output[i + c] = originalData.data[i + c];
        }
      }
      output[i + 3] = originalData.data[i + 3]; // 保持alpha通道
    }

    return new ImageData(output, originalData.width, originalData.height);
  };

  // 拉普拉斯锐化
  const laplacianSharpen = (imageData, strength) => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    
    // 拉普拉斯算子
    const kernel = [0, -1, 0, -1, 4, -1, 0, -1, 0];
    const factor = strength / 100;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const centerIdx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let kernelIdx = 0;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const pixelIdx = ((y + dy) * width + (x + dx)) * 4 + c;
              sum += data[pixelIdx] * kernel[kernelIdx];
              kernelIdx++;
            }
          }

          const sharpened = data[centerIdx + c] + sum * factor / 3;
          output[centerIdx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
        }
      }
    }

    return new ImageData(output, width, height);
  };

  // 皮肤美白处理
  const skinWhitening = (imageData, strength) => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);

    // RGB to YCbCr
    const ycbcr = new Float32Array(width * height * 3);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const idx = (i / 4) * 3;

      ycbcr[idx] = 0.299 * r + 0.587 * g + 0.114 * b; // Y
      ycbcr[idx + 1] = -0.168736 * r - 0.331264 * g + 0.5 * b + 0.5; // Cb
      ycbcr[idx + 2] = 0.5 * r - 0.418688 * g - 0.081312 * b + 0.5; // Cr
    }

    // 计算Cb和Cr的均值
    let cbSum = 0, crSum = 0;
    for (let i = 0; i < width * height; i++) {
      cbSum += ycbcr[i * 3 + 1];
      crSum += ycbcr[i * 3 + 2];
    }
    const cbMean = cbSum / (width * height);
    const crMean = crSum / (width * height);

    // 计算方差
    let cbVar = 0, crVar = 0;
    for (let i = 0; i < width * height; i++) {
      const cbDiff = ycbcr[i * 3 + 1] - cbMean;
      const crDiff = ycbcr[i * 3 + 2] - crMean;
      cbVar += cbDiff * cbDiff;
      crVar += crDiff * crDiff;
    }
    cbVar /= (width * height);
    crVar /= (width * height);

    // 提取near-white区域
    const whitenFactor = strength / 100;
    const brightPixels = [];
    
    for (let i = 0; i < width * height; i++) {
      const cb = ycbcr[i * 3 + 1];
      const cr = ycbcr[i * 3 + 2];
      const y = ycbcr[i * 3];
      
      const cbCondition = Math.abs(cb - (cbMean + cbVar * Math.sign(cbMean))) < 1.5 * cbVar;
      const crCondition = Math.abs(cr - (1.5 * crMean + crVar * Math.sign(crMean))) < 1.5 * crVar;
      
      if (cbCondition && crCondition) {
        brightPixels.push({ index: i, brightness: y });
      }
    }

    // 计算增益
    if (brightPixels.length > 0) {
      brightPixels.sort((a, b) => b.brightness - a.brightness);
      const topPixels = brightPixels.slice(0, Math.max(1, Math.floor(brightPixels.length / 10)));
      
      let rSum = 0, gSum = 0, bSum = 0, yMax = 0;
      for (const pixel of topPixels) {
        const i = pixel.index * 4;
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        yMax = Math.max(yMax, pixel.brightness);
      }
      
      const rAvg = rSum / topPixels.length;
      const gAvg = gSum / topPixels.length;
      const bAvg = bSum / topPixels.length;
      
      const targetBrightness = yMax * 0.15 * 255;
      const rGain = Math.min(2, targetBrightness / rAvg) * whitenFactor + (1 - whitenFactor);
      const gGain = Math.min(2, targetBrightness / gAvg) * whitenFactor + (1 - whitenFactor);
      const bGain = Math.min(2, targetBrightness / bAvg) * whitenFactor + (1 - whitenFactor);

      // 应用增益
      for (let i = 0; i < data.length; i += 4) {
        output[i] = Math.min(255, Math.round(data[i] * rGain));
        output[i + 1] = Math.min(255, Math.round(data[i + 1] * gGain));
        output[i + 2] = Math.min(255, Math.round(data[i + 2] * bGain));
        output[i + 3] = data[i + 3];
      }
    } else {
      // 如果没有找到合适的像素，直接复制原图
      output.set(data);
    }

    return new ImageData(output, width, height);
  };

  // 完整的美颜处理流程（带进度回调）
  const processBeautyEffect = async (canvas, params, isPreview = false, progressCallback = null) => {
    const ctx = canvas.getContext('2d');
    const img = originalImageRef.current;
    
    // 设置画布大小
    if (isPreview) {
      const maxSize = 300;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.floor(img.width * scale);
      canvas.height = Math.floor(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    }

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 步骤1: 双边滤波
    if (progressCallback) progressCallback(20, '正在进行双边滤波...');
    await new Promise(resolve => setTimeout(resolve, 50)); // 让UI更新
    const filteredData = bilateralFilter(imageData, params.sigmaSpace, params.sigmaColor);
    
    // 步骤2: 肤色检测
    if (progressCallback) progressCallback(40, '正在检测肤色区域...');
    await new Promise(resolve => setTimeout(resolve, 50));
    let skinMask;
    if (params.skinDetection) {
      const firstMask = firstSkinFilter(imageData);
      skinMask = ycgcrSkinDetection(imageData, params.skinSensitivity);
      
      // 合并两个掩膜
      for (let i = 0; i < skinMask.length; i++) {
        skinMask[i] = skinMask[i] && firstMask[i];
      }
    } else {
      // 如果不启用肤色检测，对整个图像应用效果
      skinMask = new Uint8Array(canvas.width * canvas.height).fill(1);
    }
    
    // 步骤3: 图像融合
    if (progressCallback) progressCallback(60, '正在融合图像...');
    await new Promise(resolve => setTimeout(resolve, 50));
    let fusedData = fuseImages(imageData, filteredData, skinMask, params.bilateralStrength * params.overallStrength / 100);
    
    // 步骤4: 锐化处理
    if (params.sharpenStrength > 0) {
      if (progressCallback) progressCallback(80, '正在进行锐化处理...');
      await new Promise(resolve => setTimeout(resolve, 50));
      fusedData = laplacianSharpen(fusedData, params.sharpenStrength * params.overallStrength / 100);
    }
    
    // 步骤5: 美白处理
    if (params.whitenStrength > 0) {
      if (progressCallback) progressCallback(90, '正在进行美白处理...');
      await new Promise(resolve => setTimeout(resolve, 50));
      fusedData = skinWhitening(fusedData, params.whitenStrength * params.overallStrength / 100);
    }
    
    // 将处理后的数据放回画布
    if (progressCallback) progressCallback(100, '处理完成');
    ctx.putImageData(fusedData, 0, 0);
    
    return canvas;
  };

  // 预览效果
  const previewEffect = async () => {
    if (!originalImageRef.current) return;
    
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStep('开始预览...');
    
    try {
      const canvas = previewCanvasRef.current;
      await processBeautyEffect(canvas, beautyParams, true, (progress, step) => {
        setProcessingProgress(progress);
        setProcessingStep(step);
      });
      setShowPreview(true);
    } catch (error) {
      console.error('预览处理失败:', error);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStep('');
    }
  };

  // 应用美颜效果
  const applyBeautyEffect = async () => {
    if (!originalImageRef.current) return;

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStep('开始应用美颜...');

    try {
      const canvas = canvasRef.current;
      await processBeautyEffect(canvas, beautyParams, false, (progress, step) => {
        setProcessingProgress(progress);
        setProcessingStep(step);
      });

      // 将画布转换为 Blob
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          element.set({ 
            src: url,
            beautyParams: beautyParams
          });
        }
      }, 'image/png');

    } catch (error) {
      console.error('美颜处理失败:', error);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStep('');
    }
  };

  // 重置效果
  const resetEffect = () => {
    if (originalImageRef.current) {
      element.set({
        src: originalImageRef.current.src,
        beautyParams: null
      });
      setBeautyParams({
        bilateralStrength: 75,
        sigmaSpace: 8,
        sigmaColor: 40,
        skinDetection: true,
        skinSensitivity: 50,
        sharpenStrength: 30,
        whitenStrength: 20,
        overallStrength: 75
      });
      setShowPreview(false);
    }
  };

  // 更新参数的辅助函数
  const updateParam = (param, value) => {
    setBeautyParams(prev => ({
      ...prev,
      [param]: value
    }));
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginBottom: '20px' }}>专业磨皮美颜</h3>
      
      {/* 整体强度控制 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          整体强度: {beautyParams.overallStrength}%
        </label>
        <Slider
          min={0}
          max={100}
          stepSize={1}
          value={beautyParams.overallStrength}
          onChange={(value) => updateParam('overallStrength', value)}
          labelStepSize={25}
        />
      </div>

      {/* 肤色检测开关 */}
      <div style={{ marginBottom: '20px' }}>
        <Switch
          checked={beautyParams.skinDetection}
          label="启用肤色检测（推荐）"
          onChange={(e) => updateParam('skinDetection', e.currentTarget.checked)}
        />
        {beautyParams.skinDetection && (
          <div style={{ marginTop: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              肤色检测敏感度: {beautyParams.skinSensitivity}%
            </label>
            <Slider
              min={0}
              max={100}
              stepSize={1}
              value={beautyParams.skinSensitivity}
              onChange={(value) => updateParam('skinSensitivity', value)}
              labelStepSize={50}
            />
          </div>
        )}
      </div>

      {/* 高级参数控制 */}
      <div style={{ marginBottom: '20px' }}>
        <Button
          onClick={() => setShowAdvanced(!showAdvanced)}
          minimal
          rightIcon={showAdvanced ? "chevron-up" : "chevron-down"}
        >
          高级参数设置
        </Button>
        
        <Collapse isOpen={showAdvanced}>
          <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
            
            {/* 磨皮强度 */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                磨皮强度: {beautyParams.bilateralStrength}%
              </label>
              <Slider
                min={0}
                max={100}
                stepSize={1}
                value={beautyParams.bilateralStrength}
                onChange={(value) => updateParam('bilateralStrength', value)}
                labelStepSize={50}
              />
            </div>

            {/* 空间标准差 */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                空间平滑度: {beautyParams.sigmaSpace}
              </label>
              <Slider
                min={1}
                max={15}
                stepSize={1}
                value={beautyParams.sigmaSpace}
                onChange={(value) => updateParam('sigmaSpace', value)}
                labelStepSize={7}
              />
            </div>

            {/* 颜色标准差 */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                颜色保护: {beautyParams.sigmaColor}%
              </label>
              <Slider
                min={10}
                max={100}
                stepSize={1}
                value={beautyParams.sigmaColor}
                onChange={(value) => updateParam('sigmaColor', value)}
                labelStepSize={45}
              />
            </div>

            {/* 锐化强度 */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                锐化强度: {beautyParams.sharpenStrength}%
              </label>
              <Slider
                min={0}
                max={100}
                stepSize={1}
                value={beautyParams.sharpenStrength}
                onChange={(value) => updateParam('sharpenStrength', value)}
                labelStepSize={50}
              />
            </div>

            {/* 美白强度 */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                美白强度: {beautyParams.whitenStrength}%
              </label>
              <Slider
                min={0}
                max={100}
                stepSize={1}
                value={beautyParams.whitenStrength}
                onChange={(value) => updateParam('whitenStrength', value)}
                labelStepSize={50}
              />
            </div>
          </div>
        </Collapse>
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        <Button
          onClick={previewEffect}
          intent="secondary"
          disabled={!element || element.type !== 'image' || isProcessing}
        >
          预览效果
        </Button>
        <Button
          onClick={applyBeautyEffect}
          loading={isProcessing}
          intent="primary"
          disabled={!element || element.type !== 'image' || isProcessing}
        >
          应用美颜
        </Button>
        <Button
          onClick={resetEffect}
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

      {/* 预览显示 */}
      {showPreview && previewCanvasRef.current && (
        <div style={{ 
          marginBottom: '20px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '10px',
          backgroundColor: '#f9f9f9'
        }}>
          <h4 style={{ margin: '0 0 10px 0' }}>效果预览：</h4>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center',
            maxHeight: '300px',
            overflow: 'auto'
          }}>
            <img 
              src={previewCanvasRef.current.toDataURL()} 
              alt="美颜预览" 
              style={{ 
                maxWidth: '100%',
                height: 'auto',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            />
          </div>
        </div>
      )}

      {/* 算法说明 */}
      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '15px',
        borderRadius: '5px',
        marginBottom: '15px',
        fontSize: '12px'
      }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>专业美颜算法流程：</p>
        <ol style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>双边滤波</strong>：保边去噪，平滑肌肤纹理</li>
          <li><strong>肤色检测</strong>：RGB + YCgCr双重检测，精准识别肌肤区域</li>
          <li><strong>图像融合</strong>：只对肌肤区域应用美颜效果</li>
          <li><strong>拉普拉斯锐化</strong>：增强图像细节和轮廓</li>
          <li><strong>自适应美白</strong>：基于参考白点的智能美白</li>
        </ol>
      </div>

      {/* 使用提示 */}
      <div style={{ fontSize: '12px', color: '#666' }}>
        <p><strong>使用建议：</strong></p>
        <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
          <li>人像照片建议开启肤色检测，风景照片可关闭</li>
          <li>整体强度控制所有效果的综合程度</li>
          <li>空间平滑度越高磨皮越强，颜色保护越高边缘越清晰</li>
          <li>建议先预览效果，满意后再应用</li>
        </ul>
      </div>

      {/* 隐藏的画布 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={previewCanvasRef} style={{ display: 'none' }} />
    </div>
  );
});

// 自定义图标组件
const BeautyIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M12 2C10.11 2 8.5 3.61 8.5 5.5C8.5 7.39 10.11 9 12 9C13.89 9 15.5 7.39 15.5 5.5C15.5 3.61 13.89 2 12 2Z" opacity="0.6"/>
    <path d="M12 10C8.13 10 5 13.13 5 17V19H19V17C19 13.13 15.87 10 12 10Z" opacity="0.4"/>
    <circle cx="12" cy="15" r="2" fill="currentColor"/>
    <path d="M9 20H15L14 22H10L9 20Z" opacity="0.8"/>
  </svg>
);

// 导出磨皮美颜的 SectionTab 配置
export const SmoothingSection = {
  name: 'beauty-smoothing',
  Tab: (props) => (
    <SectionTab name="磨皮美颜" {...props}>
      <BeautyIcon />
    </SectionTab>
  ),
  Panel: SmoothingPanel,
};