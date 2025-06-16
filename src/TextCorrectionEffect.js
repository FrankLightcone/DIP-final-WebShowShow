import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// 文本扶正效果面板组件
export const TextCorrectionPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedAngle, setDetectedAngle] = useState(0);
  const [manualAngle, setManualAngle] = useState(0);
  const [detectionMethod, setDetectionMethod] = useState('projection');
  const [previewMode, setPreviewMode] = useState(false);
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
        // 重置状态
        setDetectedAngle(0);
        setManualAngle(0);
        setPreviewMode(false);
      };
      img.src = element.src;
    }
  }, [element?.src]);

  // 实时预览效果
  useEffect(() => {
    if (previewMode && originalImageRef.current && manualAngle !== 0) {
      drawPreview();
    }
  }, [manualAngle, previewMode]);

  if (!element || element.type !== 'image') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>请选择一个图像来应用文本扶正效果</p>
      </div>
    );
  }

  // 图像预处理：转换为灰度并二值化
  const preprocessImage = (imageData) => {
    const { width, height } = imageData;
    const pixels = imageData.data;
    const grayData = new Uint8ClampedArray(width * height);
    
    // 转换为灰度图
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = Math.round(
        pixels[i] * 0.299 + 
        pixels[i + 1] * 0.587 + 
        pixels[i + 2] * 0.114
      );
      grayData[i / 4] = gray;
    }

    // Otsu阈值法进行二值化
    const threshold = calculateOtsuThreshold(grayData);
    const binaryData = new Uint8ClampedArray(width * height);
    
    for (let i = 0; i < grayData.length; i++) {
      binaryData[i] = grayData[i] < threshold ? 0 : 255;
    }

    return { width, height, data: binaryData };
  };

  // Otsu阈值计算
  const calculateOtsuThreshold = (grayData) => {
    const histogram = new Array(256).fill(0);
    const total = grayData.length;
    
    // 计算直方图
    for (let i = 0; i < total; i++) {
      histogram[grayData[i]]++;
    }
    
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let mB = 0;
    let mF = 0;
    let max = 0;
    let between = 0;
    let threshold1 = 0;
    let threshold2 = 0;
    
    for (let i = 0; i < 256; i++) {
      wB += histogram[i];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      
      sumB += i * histogram[i];
      mB = sumB / wB;
      mF = (sum - sumB) / wF;
      between = wB * wF * (mB - mF) * (mB - mF);
      
      if (between >= max) {
        threshold1 = i;
        if (between > max) {
          threshold2 = i;
        }
        max = between;
      }
    }
    
    return (threshold1 + threshold2) / 2;
  };

  // 使用投影法检测角度
  const detectAngleByProjection = (binaryImage) => {
    const { width, height, data } = binaryImage;
    let bestAngle = 0;
    let maxVariance = 0;
    
    console.log('开始投影法检测，图像尺寸:', width, 'x', height);
    
    // 在-30到30度范围内搜索，步长0.5度
    for (let angle = -30; angle <= 30; angle += 0.5) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      
      // 简化投影计算 - 使用垂直投影检测水平文本行
      const projLength = height;
      const projection = new Array(projLength).fill(0);
      
      // 对每一行计算黑色像素数量
      for (let y = 0; y < height; y++) {
        let blackCount = 0;
        for (let x = 0; x < width; x++) {
          // 计算旋转后的坐标
          const rotatedX = Math.round(x * cos - y * sin);
          const rotatedY = Math.round(x * sin + y * cos);
          
          // 检查旋转后的坐标是否在原图范围内
          if (rotatedX >= 0 && rotatedX < width && rotatedY >= 0 && rotatedY < height) {
            const idx = rotatedY * width + rotatedX;
            if (idx >= 0 && idx < data.length && data[idx] === 0) {
              blackCount++;
            }
          }
        }
        projection[y] = blackCount;
      }
      
      // 计算投影的方差
      if (projection.some(val => val > 0)) {
        const mean = projection.reduce((sum, val) => sum + val, 0) / projLength;
        const variance = projection.reduce((sum, val) => sum + (val - mean) ** 2, 0) / projLength;
        
        if (variance > maxVariance) {
          maxVariance = variance;
          bestAngle = angle;
        }
      }
    }
    
    console.log('投影法检测到角度:', bestAngle, '最大方差:', maxVariance);
    return bestAngle;
  };

  // 使用霍夫变换检测直线角度 - 简化版本
  const detectAngleByHough = (binaryImage) => {
    const { width, height, data } = binaryImage;
    console.log('开始霍夫变换检测');
    
    // 简化的霍夫变换，专门检测接近水平的直线
    const angleResults = [];
    
    // 在-30到30度范围内检测
    for (let angle = -30; angle <= 30; angle += 1) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      
      let votes = 0;
      
      // 对每个黑色像素点进行霍夫变换
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[y * width + x] === 0) { // 黑色像素
            // 计算该点在当前角度下的rho值
            const rho = x * cos + y * sin;
            
            // 统计相同rho值的点数（简化版）
            let sameRhoCount = 0;
            for (let y2 = 0; y2 < height; y2++) {
              for (let x2 = 0; x2 < width; x2++) {
                if (data[y2 * width + x2] === 0) {
                  const rho2 = x2 * cos + y2 * sin;
                  if (Math.abs(rho - rho2) < 2) { // 容差为2个像素
                    sameRhoCount++;
                  }
                }
              }
            }
            
            if (sameRhoCount > votes) {
              votes = sameRhoCount;
            }
          }
        }
      }
      
      angleResults.push({ angle, votes });
    }
    
    // 找到票数最多的角度
    const bestResult = angleResults.reduce((a, b) => a.votes > b.votes ? a : b);
    console.log('霍夫变换检测到角度:', bestResult.angle, '票数:', bestResult.votes);
    
    return bestResult.angle;
  };

  // 基于文本行检测的角度检测 - 改进版本
  const detectAngleByTextLines = (binaryImage) => {
    const { width, height, data } = binaryImage;
    console.log('开始文本行检测');
    
    const horizontalLines = [];
    
    // 扫描每一行，寻找文本行
    for (let y = 0; y < height; y++) {
      let blackPixels = 0;
      let startX = -1;
      let endX = -1;
      
      // 统计这一行的黑色像素
      for (let x = 0; x < width; x++) {
        if (data[y * width + x] === 0) {
          if (startX === -1) startX = x;
          endX = x;
          blackPixels++;
        }
      }
      
      // 如果这一行有足够的文本内容，认为是文本行
      if (blackPixels > width * 0.05 && (endX - startX) > width * 0.1) {
        horizontalLines.push({
          y: y,
          startX: startX,
          endX: endX,
          centerX: (startX + endX) / 2,
          blackPixels: blackPixels,
          width: endX - startX
        });
      }
    }
    
    console.log('检测到', horizontalLines.length, '条潜在文本行');
    
    if (horizontalLines.length < 2) {
      console.log('文本行太少，无法检测角度');
      return 0;
    }
    
    // 过滤掉太短或太稀疏的行
    const validLines = horizontalLines.filter(line => 
      line.width > width * 0.2 && 
      line.blackPixels / line.width > 0.1
    );
    
    if (validLines.length < 2) {
      console.log('有效文本行太少');
      return 0;
    }
    
    // 计算相邻文本行之间的角度
    const angles = [];
    
    for (let i = 0; i < validLines.length - 1; i++) {
      const line1 = validLines[i];
      for (let j = i + 1; j < validLines.length; j++) {
        const line2 = validLines[j];
        
        // 跳过太近的行
        if (Math.abs(line2.y - line1.y) < 5) continue;
        
        // 计算两行中心点连线的角度
        const dx = line2.centerX - line1.centerX;
        const dy = line2.y - line1.y;
        
        // 角度计算：atan2(dx, dy) 给出相对于垂直方向的角度
        const angle = Math.atan2(dx, dy) * 180 / Math.PI;
        
        // 只考虑小角度倾斜（-30到30度）
        if (Math.abs(angle) <= 30) {
          angles.push(angle);
        }
      }
    }
    
    console.log('计算出的角度数组:', angles);
    
    if (angles.length === 0) return 0;
    
    // 计算角度的中位数
    angles.sort((a, b) => a - b);
    const medianAngle = angles[Math.floor(angles.length / 2)];
    
    console.log('文本行检测到角度:', medianAngle);
    return medianAngle;
  };

  // 综合检测角度
  const detectTextAngle = async (imageData) => {
    console.log('开始综合角度检测');
    const binaryImage = preprocessImage(imageData);
    
    // 检查二值化结果
    const blackPixelCount = binaryImage.data.filter(pixel => pixel === 0).length;
    const totalPixels = binaryImage.data.length;
    const blackRatio = blackPixelCount / totalPixels;
    
    console.log('二值化结果 - 黑色像素比例:', (blackRatio * 100).toFixed(2) + '%');
    
    if (blackRatio < 0.01) {
      console.log('图像中文本内容太少，无法检测角度');
      return 0;
    }
    
    const methods = [];
    const methodResults = [];
    
    try {
      if (detectionMethod === 'projection' || detectionMethod === 'combined') {
        const angle = detectAngleByProjection(binaryImage);
        methods.push(angle);
        methodResults.push({ method: '投影法', angle });
        console.log('投影法结果:', angle);
      }
    } catch (error) {
      console.error('投影法检测失败:', error);
    }
    
    try {
      if (detectionMethod === 'hough' || detectionMethod === 'combined') {
        const angle = detectAngleByHough(binaryImage);
        methods.push(angle);
        methodResults.push({ method: '霍夫变换', angle });
        console.log('霍夫变换结果:', angle);
      }
    } catch (error) {
      console.error('霍夫变换检测失败:', error);
    }
    
    try {
      if (detectionMethod === 'textlines' || detectionMethod === 'combined') {
        const angle = detectAngleByTextLines(binaryImage);
        methods.push(angle);
        methodResults.push({ method: '文本行检测', angle });
        console.log('文本行检测结果:', angle);
      }
    } catch (error) {
      console.error('文本行检测失败:', error);
    }
    
    console.log('所有检测结果:', methodResults);
    
    if (methods.length === 0) {
      console.log('所有检测方法都失败了');
      return 0;
    }
    
    // 过滤异常值（超出合理范围的角度）
    const validAngles = methods.filter(angle => 
      !isNaN(angle) && 
      Math.abs(angle) <= 30 && 
      angle !== 0 // 排除无效的0度结果
    );
    
    console.log('有效角度:', validAngles);
    
    if (validAngles.length === 0) {
      // 如果没有有效角度，但有结果，取最接近0的
      const nearZeroAngles = methods.filter(angle => !isNaN(angle) && Math.abs(angle) <= 30);
      if (nearZeroAngles.length > 0) {
        const result = nearZeroAngles.reduce((a, b) => Math.abs(a) < Math.abs(b) ? a : b);
        console.log('最终结果（最接近0）:', result);
        return Math.round(result * 10) / 10;
      }
      return 0;
    }
    
    // 如果只有一个有效角度，直接返回
    if (validAngles.length === 1) {
      const result = validAngles[0];
      console.log('最终结果（单一有效角度）:', result);
      return Math.round(result * 10) / 10;
    }
    
    // 多个角度时，计算中位数
    validAngles.sort((a, b) => a - b);
    const median = validAngles[Math.floor(validAngles.length / 2)];
    
    // 如果中位数接近某些角度的平均值，使用平均值
    const clusteredAngles = validAngles.filter(angle => Math.abs(angle - median) <= 2);
    const average = clusteredAngles.reduce((sum, angle) => sum + angle, 0) / clusteredAngles.length;
    
    const result = Math.round(average * 10) / 10;
    console.log('最终结果（加权平均）:', result);
    return result;
  };

  // 应用旋转变换（使用高质量插值）
  const rotateImage = (imageData, angle) => {
    const { width, height } = imageData;
    const pixels = imageData.data;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    // 计算旋转后的画布大小
    const newWidth = Math.ceil(Math.abs(width * cos) + Math.abs(height * sin));
    const newHeight = Math.ceil(Math.abs(width * sin) + Math.abs(height * cos));
    
    const newImageData = new ImageData(newWidth, newHeight);
    const newPixels = newImageData.data;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const newCenterX = newWidth / 2;
    const newCenterY = newHeight / 2;
    
    // 使用逆变换和双线性插值
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const dx = x - newCenterX;
        const dy = y - newCenterY;
        
        // 逆变换到原图坐标
        const sourceX = dx * cos + dy * sin + centerX;
        const sourceY = -dx * sin + dy * cos + centerY;
        
        const newIdx = (y * newWidth + x) * 4;
        
        if (sourceX >= 0 && sourceX < width - 1 && sourceY >= 0 && sourceY < height - 1) {
          // 双线性插值
          const x1 = Math.floor(sourceX);
          const y1 = Math.floor(sourceY);
          const x2 = x1 + 1;
          const y2 = y1 + 1;
          
          const wx = sourceX - x1;
          const wy = sourceY - y1;
          
          for (let c = 0; c < 4; c++) {
            const p1 = pixels[(y1 * width + x1) * 4 + c];
            const p2 = pixels[(y1 * width + x2) * 4 + c];
            const p3 = pixels[(y2 * width + x1) * 4 + c];
            const p4 = pixels[(y2 * width + x2) * 4 + c];
            
            const interpolated = 
              p1 * (1 - wx) * (1 - wy) +
              p2 * wx * (1 - wy) +
              p3 * (1 - wx) * wy +
              p4 * wx * wy;
            
            newPixels[newIdx + c] = Math.round(interpolated);
          }
        } else {
          // 填充白色背景
          newPixels[newIdx] = 255;     // R
          newPixels[newIdx + 1] = 255; // G
          newPixels[newIdx + 2] = 255; // B
          newPixels[newIdx + 3] = 255; // A
        }
      }
    }
    
    return newImageData;
  };

  // 绘制预览
  const drawPreview = () => {
    if (!originalImageRef.current || !previewCanvasRef.current) return;
    
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = originalImageRef.current;
    
    // 设置预览画布大小（缩放显示）
    const scale = Math.min(200 / img.width, 150 / img.height);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    
    // 清空画布
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 应用旋转并绘制
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((manualAngle * Math.PI) / 180);
    ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    ctx.restore();
  };

  // 检测角度
  const detectAngle = async () => {
    if (!originalImageRef.current) return;
    
    setIsDetecting(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = originalImageRef.current;
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const angle = await detectTextAngle(imageData);
      
      setDetectedAngle(angle);
      setManualAngle(angle);
      
    } catch (error) {
      console.error('角度检测失败:', error);
      alert('角度检测失败，请检查图像是否包含清晰的文本');
    } finally {
      setIsDetecting(false);
    }
  };

  // 应用文本矫正
  const applyTextCorrection = async () => {
    if (!originalImageRef.current || manualAngle === 0) return;
    
    setIsProcessing(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = originalImageRef.current;
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rotatedImageData = rotateImage(imageData, -manualAngle); // 注意角度方向
      
      // 创建新的画布来容纳旋转后的图像
      const newCanvas = document.createElement('canvas');
      const newCtx = newCanvas.getContext('2d');
      newCanvas.width = rotatedImageData.width;
      newCanvas.height = rotatedImageData.height;
      newCtx.putImageData(rotatedImageData, 0, 0);
      
      // 转换为Blob并更新元素
      newCanvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          element.set({ src: url });
          element.set({
            customTextCorrection: manualAngle,
            customTextCorrectionDetected: detectedAngle
          });
        }
      }, 'image/png', 0.95);
      
    } catch (error) {
      console.error('文本矫正处理失败:', error);
      alert('文本矫正处理失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  // 重置矫正
  const resetCorrection = () => {
    if (originalImageRef.current) {
      element.set({ 
        src: originalImageRef.current.src,
        customTextCorrection: 0,
        customTextCorrectionDetected: 0
      });
      setDetectedAngle(0);
      setManualAngle(0);
      setPreviewMode(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginBottom: '20px' }}>文本矫正</h3>

      {/* 检测方法选择 */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>检测方法:</p>
        <RadioGroup
          selectedValue={detectionMethod}
          onChange={(e) => setDetectionMethod(e.target.value)}
        >
          <Radio label="投影法" value="projection" />
          <Radio label="霍夫变换" value="hough" />
          <Radio label="文本行检测" value="textlines" />
          <Radio label="综合方法" value="combined" />
        </RadioGroup>
      </div>

      {/* 角度信息和调试信息 */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ marginBottom: '10px' }}>
          检测到的角度: <strong>{detectedAngle.toFixed(1)}°</strong>
          {detectedAngle !== 0 && (
            <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
              (负值表示逆时针倾斜，正值表示顺时针倾斜)
            </span>
          )}
        </p>
        <p style={{ marginBottom: '10px' }}>
          调整角度: <strong>{manualAngle.toFixed(1)}°</strong>
        </p>
        <Slider
          min={-30}
          max={30}
          stepSize={0.1}
          value={manualAngle}
          onChange={(value) => {
            setManualAngle(value);
            if (previewMode) drawPreview();
          }}
          labelStepSize={10}
        />
        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
          拖动滑块微调角度，或直接输入数值
        </div>
      </div>

      {/* 预览 */}
      <div style={{ marginBottom: '20px' }}>
        <label>
          <input
            type="checkbox"
            checked={previewMode}
            onChange={(e) => {
              setPreviewMode(e.target.checked);
              if (e.target.checked) drawPreview();
            }}
            style={{ marginRight: '8px' }}
          />
          实时预览
        </label>
        {previewMode && (
          <div style={{ marginTop: '10px', textAlign: 'center' }}>
            <canvas 
              ref={previewCanvasRef} 
              style={{ 
                border: '1px solid #ccc',
                maxWidth: '200px',
                maxHeight: '150px'
              }} 
            />
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Button 
          onClick={detectAngle}
          loading={isDetecting}
          intent="primary"
          icon="search"
        >
          检测角度
        </Button>
        <Button 
          onClick={applyTextCorrection}
          loading={isProcessing}
          intent="success"
          icon="tick"
          disabled={manualAngle === 0}
        >
          应用矫正
        </Button>
        <Button 
          onClick={resetCorrection}
          disabled={!originalImageRef.current}
          icon="refresh"
        >
          重置
        </Button>
      </div>

      {/* 使用说明 */}
      <div style={{ 
        backgroundColor: '#f5f5f5', 
        padding: '15px', 
        borderRadius: '5px',
        marginBottom: '15px',
        fontSize: '12px'
      }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>使用说明：</p>
        <ol style={{ margin: '0', paddingLeft: '20px' }}>
          <li>选择合适的检测方法（推荐使用"综合方法"）</li>
          <li>点击"检测角度"按钮自动检测文本倾斜角度</li>
          <li>使用滑块微调角度，可开启实时预览查看效果</li>
          <li>点击"应用矫正"按钮应用旋转效果</li>
          <li>如需重新开始，点击"重置"按钮</li>
        </ol>
      </div>

      {/* 方法说明 */}
      <div style={{ 
        backgroundColor: '#e8f4f8', 
        padding: '15px', 
        borderRadius: '5px',
        fontSize: '12px'
      }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>检测方法说明：</p>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>投影法</strong>: 适用于规整的文档，通过分析文本行的水平投影检测倾斜</li>
          <li><strong>霍夫变换</strong>: 适用于包含直线的图像，检测图像中的主要直线方向</li>
          <li><strong>文本行检测</strong>: 直接检测文本行的倾斜角度，适用于清晰的文本图像</li>
          <li><strong>综合方法</strong>: 结合多种方法，提供最准确的检测结果</li>
        </ul>
      </div>

      {/* 隐藏的画布用于图像处理 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
});

// 自定义图标组件
const TextCorrectionIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17h18v2H3v-2zM3 5v12l3-3h12l3 3V5H3zm2 2h14v6l-1-1H6l-1 1V7zm2 2h10v2H7V9z"/>
    <path d="M8 11h8l-1 1H9l-1-1z" opacity="0.5"/>
  </svg>
);

// 导出文本扶正效果的 SectionTab 配置
export const TextCorrectionSection = {
  name: 'textCorrection',
  Tab: (props) => (
    <SectionTab name="文本矫正" {...props}>
      <TextCorrectionIcon />
    </SectionTab>
  ),
  Panel: TextCorrectionPanel,
};