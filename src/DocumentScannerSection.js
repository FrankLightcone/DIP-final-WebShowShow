import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio, Switch } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// TensorFlow.js for ML-based document detection
let tf = null;
let documentDetectionModel = null;

// Dynamically import TensorFlow.js
const loadTensorFlow = async () => {
  if (!tf) {
    try {
      tf = await import('@tensorflow/tfjs');
      console.log('TensorFlow.js loaded successfully');
      return true;
    } catch (error) {
      console.warn('TensorFlow.js not available, using traditional method:', error);
      return false;
    }
  }
  return true;
};

// Load pre-trained document detection model
const loadDocumentDetectionModel = async () => {
  if (!tf || documentDetectionModel) return documentDetectionModel;
  
  try {
    // Try to load a document detection model
    // You can replace this URL with your own trained model
    const modelUrl = '/models/document-detector/model.json';
    documentDetectionModel = await tf.loadLayersModel(modelUrl);
    console.log('Document detection model loaded successfully');
    return documentDetectionModel;
  } catch (error) {
    console.warn('Could not load ML model, falling back to traditional method:', error);
    return null;
  }
};

// 文档扫描面板组件
export const DocumentScannerPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState(null);
  const [adjustedCorners, setAdjustedCorners] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedCorner, setDraggedCorner] = useState(null);
  const [enhancement, setEnhancement] = useState({
    brightness: 20,
    contrast: 30,
    threshold: false
  });
  const [cannyResult, setCannyResult] = useState(null);
  const [scannedPages, setScannedPages] = useState([]);
  
  const canvasRef = useRef(null);
  const edgeCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const processedCanvasRef = useRef(null);
  const originalImageRef = useRef(null);
  
  // ML-based document corner detection
  const detectDocumentWithML = async (imageElement) => {
    if (!tf || !documentDetectionModel) return null;
    
    try {
      // Preprocess image for ML model (resize to 512x512)
      const tensor = tf.browser.fromPixels(imageElement)
        .resizeNearestNeighbor([512, 512])
        .expandDims(0)
        .div(255.0);
      
      // Run inference
      const prediction = await documentDetectionModel.predict(tensor);
      const corners = await prediction.data();
      
      // Convert normalized coordinates back to image coordinates
      const width = imageElement.width;
      const height = imageElement.height;
      
      const detectedCorners = [
        { x: corners[0] * width, y: corners[1] * height }, // Top-left
        { x: corners[2] * width, y: corners[3] * height }, // Top-right
        { x: corners[4] * width, y: corners[5] * height }, // Bottom-right
        { x: corners[6] * width, y: corners[7] * height }  // Bottom-left
      ];
      
      // Clean up tensors
      tensor.dispose();
      prediction.dispose();
      
      console.log('ML-based document detection successful:', detectedCorners);
      return detectedCorners;
      
    } catch (error) {
      console.error('ML document detection failed:', error);
      return null;
    }
  };
  
  // Enhanced smart cropping with multiple detection strategies
  const smartCropDetection = (imageData) => {
    const { data, width, height } = imageData;
    
    console.log('开始智能裁剪检测...');
    
    // Strategy 1: Color variance detection (find document vs background)
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let documentPixels = 0;
    
    // Calculate average background color (corners sampling)
    const cornerSamples = [];
    const sampleSize = Math.min(50, Math.min(width, height) / 10);
    
    // Sample corners for background color
    for (let y = 0; y < sampleSize; y++) {
      for (let x = 0; x < sampleSize; x++) {
        const corners = [
          (y * width + x) * 4,                                    // Top-left
          (y * width + (width - 1 - x)) * 4,                      // Top-right
          ((height - 1 - y) * width + x) * 4,                     // Bottom-left
          ((height - 1 - y) * width + (width - 1 - x)) * 4        // Bottom-right
        ];
        
        corners.forEach(idx => {
          if (idx >= 0 && idx < data.length - 2) {
            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            cornerSamples.push(brightness);
          }
        });
      }
    }
    
    // Calculate background brightness threshold
    cornerSamples.sort((a, b) => a - b);
    const backgroundBrightness = cornerSamples[Math.floor(cornerSamples.length * 0.8)]; // 80th percentile
    const threshold = Math.max(180, backgroundBrightness - 30); // Adaptive threshold
    
    console.log(`背景亮度: ${backgroundBrightness}, 阈值: ${threshold}`);
    
    // Find document boundaries using adaptive threshold
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        const brightness = (r + g + b) / 3;
        
        // Check if pixel is significantly different from background
        if (brightness < threshold) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          documentPixels++;
        }
      }
    }
    
    const documentArea = (maxX - minX) * (maxY - minY);
    const imageArea = width * height;
    const coverageRatio = documentArea / imageArea;
    
    console.log(`检测到文档像素: ${documentPixels}, 文档区域: ${documentArea}, 覆盖率: ${(coverageRatio * 100).toFixed(1)}%`);
    
    // Validate detection quality
    if (documentPixels < imageArea * 0.05 || coverageRatio > 0.9 || coverageRatio < 0.1) {
      console.log('智能裁剪质量不佳，返回null');
      return null; // Poor detection, let traditional method handle it
    }
    
    // Apply smart padding based on image size
    const paddingX = Math.max(5, (maxX - minX) * 0.02);
    const paddingY = Math.max(5, (maxY - minY) * 0.02);
    
    minX = Math.max(0, minX - paddingX);
    maxX = Math.min(width - 1, maxX + paddingX);
    minY = Math.max(0, minY - paddingY);
    maxY = Math.min(height - 1, maxY + paddingY);
    
    const result = [
      { x: minX, y: minY },     // Top-left
      { x: maxX, y: minY },     // Top-right
      { x: maxX, y: maxY },     // Bottom-right
      { x: minX, y: maxY }      // Bottom-left
    ];
    
    console.log('智能裁剪成功:', result);
    return result;
  };
  
  // 新的文档检测处理函数（支持ML + 传统方法）
  const processDocumentDetection = async () => {
    if (!originalImageRef.current) return;
    
    setIsProcessing(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = originalImageRef.current;
      
      // 设置合适的处理尺寸
      const maxSize = 600;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const width = Math.floor(img.width * scale);
      const height = Math.floor(img.height * scale);
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      
      console.log(`开始处理图像: ${width}x${height}`);
      
      // 方法1: 尝试使用ML模型检测
      console.log('尝试ML文档检测...');
      let docCorners = await detectDocumentWithML(canvas);
      
      if (docCorners) {
        console.log('✅ ML检测成功');
      } else {
        console.log('❌ ML检测失败，尝试智能裁剪...');
        // 方法2: 智能裁剪（基于自适应背景检测）
        docCorners = smartCropDetection(imageData);
        
        if (docCorners) {
          console.log('✅ 智能裁剪成功');
        } else {
          console.log('❌ 智能裁剪失败，使用传统Canny方法...');
          // 方法3: 传统Canny + 轮廓检测方法
          const edges = cannyEdgeDetectionFixed(imageData);
          const dilatedEdges = dilate(edges, width, height, 3);
          const contours = findExternalContours(dilatedEdges, width, height);
          const docContour = findDocumentContourOpenCV(contours, width, height);
          
          if (docContour && docContour.length === 4) {
            docCorners = docContour;
            console.log('✅ 传统方法检测成功');
          } else {
            console.log('❌ 传统方法也失败');
          }
        }
      }
      
      // 总是显示Canny结果（用于调试）
      const edges = cannyEdgeDetectionFixed(imageData);
      const edgeCanvas = edgeCanvasRef.current;
      if (edgeCanvas) {
        const edgeCtx = edgeCanvas.getContext('2d');
        edgeCanvas.width = width;
        edgeCanvas.height = height;
        
        const edgeImageData = edgeCtx.createImageData(width, height);
        for (let i = 0; i < edges.length; i++) {
          const val = edges[i];
          edgeImageData.data[i * 4] = val;
          edgeImageData.data[i * 4 + 1] = val;
          edgeImageData.data[i * 4 + 2] = val;
          edgeImageData.data[i * 4 + 3] = 255;
        }
        edgeCtx.putImageData(edgeImageData, 0, 0);
        setCannyResult(edgeCanvas.toDataURL());
      }
      
      if (docCorners && docCorners.length === 4) {
        console.log('检测到文档四边形:', docCorners);
        
        // 转换回原始图像坐标
        const scaledCorners = docCorners.map(corner => ({
          x: corner.x / scale,
          y: corner.y / scale
        }));
        
        setDetectedCorners(scaledCorners);
        setAdjustedCorners(scaledCorners);
        
        console.log('角点设置完成:', scaledCorners);
      } else {
        console.log('所有方法都失败，使用默认区域');
        
        // 使用默认角点
        const defaultCorners = [
          { x: img.width * 0.05, y: img.height * 0.05 },
          { x: img.width * 0.95, y: img.height * 0.05 },
          { x: img.width * 0.95, y: img.height * 0.95 },
          { x: img.width * 0.05, y: img.height * 0.95 }
        ];
        setDetectedCorners(defaultCorners);
        setAdjustedCorners(defaultCorners);
      }
      
    } catch (error) {
      console.error('文档边缘检测失败:', error);
      
      // 错误时设置默认角点
      if (originalImageRef.current) {
        const img = originalImageRef.current;
        const defaultCorners = [
          { x: img.width * 0.05, y: img.height * 0.05 },
          { x: img.width * 0.95, y: img.height * 0.05 },
          { x: img.width * 0.95, y: img.height * 0.95 },
          { x: img.width * 0.05, y: img.height * 0.95 }
        ];
        setDetectedCorners(defaultCorners);
        setAdjustedCorners(defaultCorners);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // 初始化TensorFlow.js和模型
  useEffect(() => {
    const initializeML = async () => {
      console.log('初始化TensorFlow.js...');
      const tfLoaded = await loadTensorFlow();
      if (tfLoaded) {
        console.log('尝试加载文档检测模型...');
        await loadDocumentDetectionModel();
      }
    };
    
    initializeML();
  }, []);
  
  // 当选中元素改变时，保存原始图像
  useEffect(() => {
    if (element && element.type === 'image' && element.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        originalImageRef.current = img;
        // 自动进行文档检测（支持ML + 传统方法）
        processDocumentDetection();
      };
      img.src = element.src;
    }
  }, [element?.src]);
  
  // 改进的高斯模糊（使用更大的核）
  const gaussianBlurImproved = (data, width, height, sigma = 1.4) => {
    // 计算高斯核大小
    const kernelSize = Math.ceil(sigma * 6) | 1; // 确保是奇数
    const halfKernel = Math.floor(kernelSize / 2);
    
    // 生成高斯核
    const kernel = new Float32Array(kernelSize);
    let sum = 0;
    for (let i = 0; i < kernelSize; i++) {
      const x = i - halfKernel;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      sum += kernel[i];
    }
    // 归一化
    for (let i = 0; i < kernelSize; i++) {
      kernel[i] /= sum;
    }
    
    const temp = new Float32Array(width * height);
    const output = new Float32Array(width * height);
    
    // 水平方向模糊
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = 0; k < kernelSize; k++) {
          const px = Math.max(0, Math.min(width - 1, x + k - halfKernel));
          sum += data[y * width + px] * kernel[k];
        }
        temp[y * width + x] = sum;
      }
    }
    
    // 垂直方向模糊
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = 0; k < kernelSize; k++) {
          const py = Math.max(0, Math.min(height - 1, y + k - halfKernel));
          sum += temp[py * width + x] * kernel[k];
        }
        output[y * width + x] = sum;
      }
    }
    
    return output;
  };
  
  // 改进的Sobel算子
  const sobelOperatorImproved = (data, width, height) => {
    const magnitude = new Float32Array(width * height);
    const direction = new Float32Array(width * height);
    
    // Sobel核
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        // 应用Sobel核
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            
            gx += data[idx] * sobelX[kernelIdx];
            gy += data[idx] * sobelY[kernelIdx];
          }
        }
        
        const idx = y * width + x;
        magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
        direction[idx] = Math.atan2(gy, gx);
      }
    }
    
    return { magnitude, direction };
  };
  
  // 改进的非极大值抑制
  const nonMaximumSuppressionImproved = (magnitude, direction, width, height) => {
    const output = new Float32Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const angle = direction[idx];
        const mag = magnitude[idx];
        
        // 将角度转换为0-180度范围
        let normalizedAngle = angle * 180 / Math.PI;
        if (normalizedAngle < 0) normalizedAngle += 180;
        
        let neighbor1, neighbor2;
        
        // 根据梯度方向选择相邻像素
        if ((normalizedAngle >= 0 && normalizedAngle < 22.5) || 
            (normalizedAngle >= 157.5 && normalizedAngle <= 180)) {
          // 水平方向 (0度)
          neighbor1 = magnitude[idx - 1];
          neighbor2 = magnitude[idx + 1];
        } else if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) {
          // 对角线方向 (45度)
          neighbor1 = magnitude[idx - width - 1];
          neighbor2 = magnitude[idx + width + 1];
        } else if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) {
          // 垂直方向 (90度)
          neighbor1 = magnitude[idx - width];
          neighbor2 = magnitude[idx + width];
        } else if (normalizedAngle >= 112.5 && normalizedAngle < 157.5) {
          // 对角线方向 (135度)
          neighbor1 = magnitude[idx - width + 1];
          neighbor2 = magnitude[idx + width - 1];
        } else {
          neighbor1 = neighbor2 = 0;
        }
        
        // 如果当前像素是局部最大值，则保留
        if (mag >= neighbor1 && mag >= neighbor2) {
          output[idx] = mag;
        }
      }
    }
    
    return output;
  };
  
  // 改进的双阈值检测
  const doubleThresholdImproved = (data, width, height, lowRatio = 0.1, highRatio = 0.3) => {
    // 计算动态阈值
    let maxVal = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > maxVal) maxVal = data[i];
    }
    
    const lowThreshold = maxVal * lowRatio;
    const highThreshold = maxVal * highRatio;
    
    const edges = new Uint8ClampedArray(width * height);
    const STRONG = 255;
    const WEAK = 127;
    
    // 第一步：根据阈值分类像素
    for (let i = 0; i < data.length; i++) {
      if (data[i] >= highThreshold) {
        edges[i] = STRONG;
      } else if (data[i] >= lowThreshold) {
        edges[i] = WEAK;
      } // 其他像素保持为0
    }
    
    // 第二步：边缘连接（滞后阈值）
    const visited = new Uint8Array(width * height);
    
    // 8邻域方向
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    
    // 从强边缘开始进行边缘跟踪
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (edges[idx] === STRONG && !visited[idx]) {
          // DFS连接弱边缘
          const stack = [{ x, y }];
          
          while (stack.length > 0) {
            const { x: cx, y: cy } = stack.pop();
            const cidx = cy * width + cx;
            
            if (visited[cidx]) continue;
            visited[cidx] = 1;
            
            // 检查8个邻居
            for (const [dx, dy] of directions) {
              const nx = cx + dx;
              const ny = cy + dy;
              
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = ny * width + nx;
                
                if (!visited[nidx] && edges[nidx] === WEAK) {
                  edges[nidx] = STRONG; // 将弱边缘提升为强边缘
                  stack.push({ x: nx, y: ny });
                }
              }
            }
          }
        }
      }
    }
    
    // 清除未连接的弱边缘
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] === WEAK) {
        edges[i] = 0;
      }
    }
    
    return edges;
  };
  
  // 完整的改进Canny边缘检测
  const cannyEdgeDetectionFixed = (imageData) => {
    const { data, width, height } = imageData;
    
    // 1. 转换为灰度图
    const grayscale = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grayscale[i / 4] = gray;
    }
    
    console.log('步骤1: 灰度转换完成');
    
    // 2. 高斯模糊降噪
    const blurred = gaussianBlurImproved(grayscale, width, height, 1.4);
    console.log('步骤2: 高斯模糊完成');
    
    // 3. 计算梯度幅值和方向
    const { magnitude, direction } = sobelOperatorImproved(blurred, width, height);
    console.log('步骤3: 梯度计算完成');
    
    // 4. 非极大值抑制
    const suppressed = nonMaximumSuppressionImproved(magnitude, direction, width, height);
    console.log('步骤4: 非极大值抑制完成');
    
    // 5. 双阈值检测和边缘连接
    const edges = doubleThresholdImproved(suppressed, width, height, 0.05, 0.15);
    console.log('步骤5: 双阈值检测完成');
    
    return edges;
  };
  
  // 形态学操作：闭运算（先膨胀后腐蚀）
  const morphologyClose = (data, width, height, kernelSize = 3) => {
    // 先膨胀
    const dilated = dilate(data, width, height, kernelSize);
    
    // 再腐蚀
    const eroded = erode(dilated, width, height, kernelSize);
    
    return eroded;
  };
  
  // 腐蚀操作
  const erode = (data, width, height, kernelSize = 3) => {
    const output = new Uint8ClampedArray(data.length);
    const halfKernel = Math.floor(kernelSize / 2);
    
    for (let y = halfKernel; y < height - halfKernel; y++) {
      for (let x = halfKernel; x < width - halfKernel; x++) {
        let minVal = 255;
        
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          for (let kx = -halfKernel; kx <= halfKernel; kx++) {
            const idx = (y + ky) * width + (x + kx);
            if (data[idx] < minVal) {
              minVal = data[idx];
            }
          }
        }
        
        output[y * width + x] = minVal;
      }
    }
    
    return output;
  };
  
  // 优化的轮廓查找
  const findContoursOptimized = (edges, width, height) => {
    const visited = new Uint8Array(width * height);
    const contours = [];
    
    // 8方向连通
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    
    // 轮廓跟踪
    const traceContour = (startX, startY) => {
      const contour = [];
      const stack = [[startX, startY]];
      
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const idx = y * width + x;
        if (visited[idx] || edges[idx] === 0) continue;
        
        visited[idx] = 1;
        contour.push({ x, y });
        
        // 添加邻居到栈中
        for (const [dx, dy] of directions) {
          stack.push([x + dx, y + dy]);
        }
      }
      
      return contour;
    };
    
    // 查找所有轮廓
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && edges[idx] > 0) {
          const contour = traceContour(x, y);
          
          // 过滤掉太小的轮廓
          if (contour.length > 100) {
            contours.push(contour);
          }
        }
      }
    }
    
    // 按面积排序
    contours.sort((a, b) => contourArea(b) - contourArea(a));
    
    console.log(`找到 ${contours.length} 个有效轮廓`);
    
    return contours;
  };
  
  // 近似多边形
  const approxPolyDP = (contour, epsilon) => {
    if (contour.length < 3) return contour;
    
    // Douglas-Peucker算法
    const douglasPeucker = (points, start, end, epsilon) => {
      let maxDist = 0;
      let maxIdx = 0;
      
      // 找到距离线段最远的点
      for (let i = start + 1; i < end; i++) {
        const dist = pointToLineDistance(points[i], points[start], points[end]);
        if (dist > maxDist) {
          maxDist = dist;
          maxIdx = i;
        }
      }
      
      // 如果最大距离大于epsilon，递归处理
      if (maxDist > epsilon) {
        const left = douglasPeucker(points, start, maxIdx, epsilon);
        const right = douglasPeucker(points, maxIdx, end, epsilon);
        
        return [...left.slice(0, -1), ...right];
      } else {
        return [points[start], points[end]];
      }
    };
    
    // 点到线段的距离
    const pointToLineDistance = (point, lineStart, lineEnd) => {
      const A = point.x - lineStart.x;
      const B = point.y - lineStart.y;
      const C = lineEnd.x - lineStart.x;
      const D = lineEnd.y - lineStart.y;
      
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      
      if (lenSq !== 0) {
        param = dot / lenSq;
      }
      
      let xx, yy;
      
      if (param < 0) {
        xx = lineStart.x;
        yy = lineStart.y;
      } else if (param > 1) {
        xx = lineEnd.x;
        yy = lineEnd.y;
      } else {
        xx = lineStart.x + param * C;
        yy = lineStart.y + param * D;
      }
      
      const dx = point.x - xx;
      const dy = point.y - yy;
      
      return Math.sqrt(dx * dx + dy * dy);
    };
    
    return douglasPeucker(contour, 0, contour.length - 1, epsilon);
  };
  
  // 计算轮廓面积
  const contourArea = (contour) => {
    let area = 0;
    const n = contour.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += contour[i].x * contour[j].y;
      area -= contour[j].x * contour[i].y;
    }
    
    return Math.abs(area) / 2;
  };
  
  // 查找最大的四边形
  const findLargestQuadrilateral = (contours, width, height) => {
    let maxArea = 0;
    let bestQuad = null;
    
    // 计算图像面积的阈值
    const imageArea = width * height;
    const minArea = imageArea * 0.1; // 至少占图像面积的10%
    const maxAreaThreshold = imageArea * 0.95; // 不超过图像面积的95%
    
    for (const contour of contours) {
      // 近似多边形
      const perimeter = calculatePerimeter(contour);
      const epsilon = 0.02 * perimeter;
      const approx = approxPolyDP(contour, epsilon);
      
      // 检查是否为四边形
      if (approx.length === 4) {
        const area = contourArea(approx);
        
        // 检查面积是否合理
        if (area > minArea && area < maxAreaThreshold && area > maxArea) {
          // 检查是否为凸四边形
          if (isConvexQuadrilateral(approx)) {
            maxArea = area;
            bestQuad = approx;
          }
        }
      }
    }
    
    return bestQuad;
  };
  
  // 计算周长
  const calculatePerimeter = (contour) => {
    let perimeter = 0;
    
    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      const dx = contour[j].x - contour[i].x;
      const dy = contour[j].y - contour[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    
    return perimeter;
  };
  
  // 检查是否为凸四边形
  const isConvexQuadrilateral = (points) => {
    if (points.length !== 4) return false;
    
    // 检查所有内角的方向一致性
    let crossProducts = [];
    for (let i = 0; i < 4; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % 4];
      const p3 = points[(i + 2) % 4];
      
      const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
      
      const cross = v1.x * v2.y - v1.y * v2.x;
      crossProducts.push(cross);
    }
    
    // 检查所有叉积的符号是否一致
    const firstSign = crossProducts[0] > 0;
    return crossProducts.every(cross => (cross > 0) === firstSign);
  };
  
  // 双边滤波（简化版本）
  const bilateralFilter = (data, width, height) => {
    const output = new Uint8ClampedArray(data.length);
    const d = 5; // 滤波器直径
    const sigmaColor = 80;
    const sigmaSpace = 80;
    
    for (let y = d; y < height - d; y++) {
      for (let x = d; x < width - d; x++) {
        let weightSum = 0;
        let valueSum = 0;
        const centerIdx = y * width + x;
        const centerValue = data[centerIdx];
        
        for (let dy = -d; dy <= d; dy++) {
          for (let dx = -d; dx <= d; dx++) {
            const idx = (y + dy) * width + (x + dx);
            const value = data[idx];
            
            const spatialDist = Math.sqrt(dx * dx + dy * dy);
            const colorDist = Math.abs(value - centerValue);
            
            const spatialWeight = Math.exp(-(spatialDist * spatialDist) / (2 * sigmaSpace * sigmaSpace));
            const colorWeight = Math.exp(-(colorDist * colorDist) / (2 * sigmaColor * sigmaColor));
            
            const weight = spatialWeight * colorWeight;
            weightSum += weight;
            valueSum += weight * value;
          }
        }
        
        output[centerIdx] = weightSum > 0 ? valueSum / weightSum : centerValue;
      }
    }
    
    return output;
  };
  
  // 形态学膨胀操作
  const dilate = (data, width, height, kernelSize = 3) => {
    const output = new Uint8ClampedArray(data.length);
    const halfKernel = Math.floor(kernelSize / 2);
    
    for (let y = halfKernel; y < height - halfKernel; y++) {
      for (let x = halfKernel; x < width - halfKernel; x++) {
        let maxVal = 0;
        
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          for (let kx = -halfKernel; kx <= halfKernel; kx++) {
            const idx = (y + ky) * width + (x + kx);
            if (data[idx] > maxVal) {
              maxVal = data[idx];
            }
          }
        }
        
        output[y * width + x] = maxVal;
      }
    }
    
    return output;
  };
  
  // 改进的轮廓查找算法
  const findContoursImproved = (edges, width, height) => {
    const visited = new Uint8Array(width * height);
    const contours = [];
    
    // 8方向
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    
    // 边界跟踪算法
    const traceContour = (startX, startY) => {
      const contour = [];
      const stack = [[startX, startY]];
      
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;
        
        if (x < 0 || x >= width || y < 0 || y >= height || visited[idx] || edges[idx] === 0) {
          continue;
        }
        
        visited[idx] = 1;
        contour.push({ x, y });
        
        // 按顺序检查8个方向
        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (!visited[nIdx] && edges[nIdx] > 0) {
              stack.push([nx, ny]);
            }
          }
        }
      }
      
      return contour;
    };
    
    // 从边界开始寻找轮廓
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && edges[idx] > 0) {
          const contour = traceContour(x, y);
          if (contour.length > 50) { // 增加最小轮廓点数
            contours.push(contour);
          }
        }
      }
    }
    
    // 按面积排序
    contours.sort((a, b) => contourArea(b) - contourArea(a));
    
    return contours;
  };
  
  // 改进的多边形近似算法
  const approxPolyDPImproved = (contour, epsilon) => {
    if (contour.length < 3) return contour;
    
    // 计算周长
    const perimeter = calculatePerimeter(contour);
    const adaptiveEpsilon = epsilon * perimeter;
    
    // 点到直线距离计算
    const pointToLineDistance = (point, lineStart, lineEnd) => {
      const A = point.x - lineStart.x;
      const B = point.y - lineStart.y;
      const C = lineEnd.x - lineStart.x;
      const D = lineEnd.y - lineStart.y;
      
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      
      if (lenSq !== 0) {
        param = dot / lenSq;
      }
      
      let xx, yy;
      
      if (param < 0) {
        xx = lineStart.x;
        yy = lineStart.y;
      } else if (param > 1) {
        xx = lineEnd.x;
        yy = lineEnd.y;
      } else {
        xx = lineStart.x + param * C;
        yy = lineStart.y + param * D;
      }
      
      const dx = point.x - xx;
      const dy = point.y - yy;
      
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Douglas-Peucker算法
    const douglasPeucker = (points, start, end, eps) => {
      if (end - start <= 1) {
        return [points[start], points[end]];
      }
      
      let maxDist = 0;
      let maxIdx = start;
      
      // 找到距离直线最远的点
      for (let i = start + 1; i < end; i++) {
        const dist = pointToLineDistance(points[i], points[start], points[end]);
        if (dist > maxDist) {
          maxDist = dist;
          maxIdx = i;
        }
      }
      
      // 如果最大距离大于阈值
      if (maxDist > eps) {
        const left = douglasPeucker(points, start, maxIdx, eps);
        const right = douglasPeucker(points, maxIdx, end, eps);
        return [...left.slice(0, -1), ...right];
      } else {
        return [points[start], points[end]];
      }
    };
    
    // 闭合轮廓的处理
    const closedContour = [...contour, contour[0]];
    const simplified = douglasPeucker(closedContour, 0, closedContour.length - 1, adaptiveEpsilon);
    
    return simplified.slice(0, -1); // 移除重复的起始点
  };
  
  // 完全模仿OpenCV的文档轮廓检测方法
  const findDocumentContourOpenCV = (contours, width, height) => {
    let docContour = null;
    
    console.log(`找到 ${contours.length} 个轮廓`);
    
    // 确保至少找到一个轮廓
    if (contours.length > 0) {
      // 按轮廓面积降序排列（完全按照OpenCV方法）
      const sortedContours = contours.sort((a, b) => contourArea(b) - contourArea(a));
      
      // 遍历每个轮廓
      for (const contour of sortedContours) {
        // 计算轮廓周长
        const perimeter = calculatePerimeter(contour);
        
        // 近似轮廓（使用周长的2%作为epsilon，完全按OpenCV参数）
        const epsilon = 0.02 * perimeter;
        const approx = approxPolyDP(contour, epsilon);
        
        console.log(`轮廓面积: ${contourArea(contour)}, 周长: ${perimeter}, 近似后点数: ${approx.length}`);
        
        // 如果我们的近似轮廓有四个顶点，则确定找到了文档
        if (approx.length === 4) {
          docContour = approx;
          console.log('找到四边形文档轮廓:', docContour);
          break;
        }
      }
    }
    
    return docContour;
  };
  
  // 寻找外部轮廓（类似OpenCV的RETR_EXTERNAL）
  const findExternalContours = (edges, width, height) => {
    const visited = new Uint8Array(width * height);
    const contours = [];
    
    // 8方向连通
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    
    // 轮廓跟踪算法
    const traceContour = (startX, startY) => {
      const contour = [];
      const stack = [[startX, startY]];
      
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;
        
        if (x < 0 || x >= width || y < 0 || y >= height || visited[idx] || edges[idx] === 0) {
          continue;
        }
        
        visited[idx] = 1;
        contour.push({ x, y });
        
        // 按顺序检查8个方向
        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (!visited[nIdx] && edges[nIdx] > 0) {
              stack.push([nx, ny]);
            }
          }
        }
      }
      
      return contour;
    };
    
    // 从边界开始寻找轮廓（仅外部轮廓）
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && edges[idx] > 0) {
          const contour = traceContour(x, y);
          // 只保留足够大的轮廓（降低阈值）
          if (contour.length > 30) {
            contours.push(contour);
          }
        }
      }
    }
    
    console.log(`找到 ${contours.length} 个外部轮廓`);
    return contours;
  };
  
  // 检查四边形是否合理
  const isReasonableQuadrilateral = (points, width, height) => {
    if (points.length !== 4) return false;
    
    // 检查点是否在图像边界内
    for (const point of points) {
      if (point.x < 0 || point.x >= width || point.y < 0 || point.y >= height) {
        return false;
      }
    }
    
    // 计算边长
    const sides = [];
    for (let i = 0; i < 4; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % 4];
      const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      sides.push(length);
    }
    
    // 检查边长比例是否合理（最长边不应该超过最短边的5倍）
    const minSide = Math.min(...sides);
    const maxSide = Math.max(...sides);
    
    if (maxSide / minSide > 5) {
      return false;
    }
    
    // 检查对角线长度
    const diag1 = Math.sqrt(Math.pow(points[2].x - points[0].x, 2) + Math.pow(points[2].y - points[0].y, 2));
    const diag2 = Math.sqrt(Math.pow(points[3].x - points[1].x, 2) + Math.pow(points[3].y - points[1].y, 2));
    
    // 对角线长度不应该相差太大
    if (Math.abs(diag1 - diag2) / Math.max(diag1, diag2) > 0.3) {
      return false;
    }
    
    return true;
  };
  
  // 改进的Canny边缘检测
  const cannyEdgeDetectionImproved = (imageData) => {
    const { data, width, height } = imageData;
    const grayscale = new Uint8ClampedArray(width * height);
    
    // 转换为灰度图
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayscale[i / 4] = gray;
    }
    
    // 双边滤波降噪（替代高斯模糊）
    const filtered = bilateralFilter(grayscale, width, height);
    
    // Canny边缘检测，使用更低的阈值
    const edges = cannyWithLowThreshold(filtered, width, height);
    
    // 膨胀操作连接边缘
    const dilated = dilate(edges, width, height, 3);
    
    return dilated;
  };
  
  // 低阈值Canny检测
  const cannyWithLowThreshold = (data, width, height) => {
    // Sobel算子
    const { magnitude, direction } = sobelOperator(data, width, height);
    
    // 非极大值抑制
    const suppressed = nonMaximumSuppression(magnitude, direction, width, height);
    
    // 使用更低的阈值
    const edges = doubleThreshold(suppressed, width, height, 15, 50); // 降低阈值
    
    return edges;
  };
  
  // 连通分量标记算法
  const findConnectedComponents = (binaryImage, width, height) => {
    const labels = new Int32Array(width * height);
    const equivalentLabels = [];
    let currentLabel = 1;
    
    // 第一遍扫描：标记连通分量
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        // 只处理背景像素 (值为0，因为边缘是白色255)
        if (binaryImage[idx] === 0) {
          const neighbors = [];
          
          // 检查上方和左方邻居
          if (y > 0 && labels[(y-1) * width + x] > 0) {
            neighbors.push(labels[(y-1) * width + x]);
          }
          if (x > 0 && labels[y * width + (x-1)] > 0) {
            neighbors.push(labels[y * width + (x-1)]);
          }
          
          if (neighbors.length === 0) {
            // 新的连通分量
            labels[idx] = currentLabel;
            equivalentLabels[currentLabel] = currentLabel;
            currentLabel++;
          } else {
            // 取最小标签
            const minLabel = Math.min(...neighbors);
            labels[idx] = minLabel;
            
            // 记录等价关系
            for (const neighbor of neighbors) {
              if (neighbor !== minLabel) {
                equivalentLabels[neighbor] = minLabel;
              }
            }
          }
        }
      }
    }
    
    // 第二遍扫描：解决等价关系
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] > 0) {
        let root = labels[i];
        while (equivalentLabels[root] !== root) {
          root = equivalentLabels[root];
        }
        labels[i] = root;
      }
    }
    
    return labels;
  };

  // 找到最大连通分量的边界框
  const findLargestComponentBounds = (labels, width, height) => {
    const componentSizes = {};
    const componentBounds = {};
    
    // 计算每个分量的大小和边界
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const label = labels[y * width + x];
        if (label > 0) {
          if (!componentSizes[label]) {
            componentSizes[label] = 0;
            componentBounds[label] = { minX: x, maxX: x, minY: y, maxY: y };
          }
          componentSizes[label]++;
          
          const bounds = componentBounds[label];
          bounds.minX = Math.min(bounds.minX, x);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxY = Math.max(bounds.maxY, y);
        }
      }
    }
    
    // 找到最大的分量
    let maxLabel = 0;
    let maxSize = 0;
    for (const label in componentSizes) {
      if (componentSizes[label] > maxSize) {
        maxSize = componentSizes[label];
        maxLabel = parseInt(label);
      }
    }
    
    return maxLabel > 0 ? componentBounds[maxLabel] : null;
  };

  // 获取外接四边形
  const getCircumscribedQuadrilateral = (bounds) => {
    if (!bounds) return null;
    
    return [
      { x: bounds.minX, y: bounds.minY }, // 左上
      { x: bounds.maxX, y: bounds.minY }, // 右上
      { x: bounds.maxX, y: bounds.maxY }, // 右下
      { x: bounds.minX, y: bounds.maxY }  // 左下
    ];
  };

  // 新的文档检测处理函数
  // 按顺时针顺序排列角点
  const sortCorners = (corners) => {
    // 计算中心点
    const center = corners.reduce((acc, corner) => ({
      x: acc.x + corner.x / corners.length,
      y: acc.y + corner.y / corners.length
    }), { x: 0, y: 0 });
    
    // 按角度排序
    return corners.sort((a, b) => {
      const angleA = Math.atan2(a.y - center.y, a.x - center.x);
      const angleB = Math.atan2(b.y - center.y, b.x - center.x);
      return angleA - angleB;
    });
  };
  
  // 正确排序角点（左上、右上、右下、左下）
  const sortCornersProper = (corners) => {
    // 计算每个点到原点的距离之和
    const pointsWithSum = corners.map(corner => ({
      ...corner,
      sum: corner.x + corner.y,
      diff: corner.x - corner.y
    }));
    
    // 最小sum是左上角，最大sum是右下角
    // 最小diff是左下角，最大diff是右上角
    const topLeft = pointsWithSum.reduce((min, point) => point.sum < min.sum ? point : min);
    const bottomRight = pointsWithSum.reduce((max, point) => point.sum > max.sum ? point : max);
    
    const remaining = pointsWithSum.filter(p => p !== topLeft && p !== bottomRight);
    const topRight = remaining.reduce((max, point) => point.diff > max.diff ? point : max);
    const bottomLeft = remaining.find(p => p !== topRight);
    
    return [topLeft, topRight, bottomRight, bottomLeft];
  };
  
  // 绘制叠加层
  const drawOverlay = () => {
    if (!adjustedCorners || !originalImageRef.current) return;
    
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const img = originalImageRef.current;
    
    canvas.width = img.width;
    canvas.height = img.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制四边形
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(adjustedCorners[0].x, adjustedCorners[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(adjustedCorners[i].x, adjustedCorners[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    
    // 绘制边框
    ctx.strokeStyle = '#4285f4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(adjustedCorners[0].x, adjustedCorners[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(adjustedCorners[i].x, adjustedCorners[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    
    // 绘制角点
    adjustedCorners.forEach((corner, index) => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 10, 0, 2 * Math.PI);
      ctx.fillStyle = '#4285f4';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // 绘制角点编号
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), corner.x, corner.y);
    });
  };
  
  // 更新角点位置后重新绘制
  useEffect(() => {
    if (adjustedCorners) {
      drawOverlay();
    }
  }, [adjustedCorners]);
  
  // 透视变换
  const perspectiveTransform = async () => {
    if (!adjustedCorners || !originalImageRef.current) return;
    
    setIsProcessing(true);
    
    try {
      const img = originalImageRef.current;
      const srcPoints = [...adjustedCorners]; // 使用调整后的角点
      
      // 计算目标矩形的尺寸
      const widthTop = Math.sqrt(
        Math.pow(srcPoints[1].x - srcPoints[0].x, 2) + 
        Math.pow(srcPoints[1].y - srcPoints[0].y, 2)
      );
      const widthBottom = Math.sqrt(
        Math.pow(srcPoints[2].x - srcPoints[3].x, 2) + 
        Math.pow(srcPoints[2].y - srcPoints[3].y, 2)
      );
      const heightLeft = Math.sqrt(
        Math.pow(srcPoints[3].x - srcPoints[0].x, 2) + 
        Math.pow(srcPoints[3].y - srcPoints[0].y, 2)
      );
      const heightRight = Math.sqrt(
        Math.pow(srcPoints[2].x - srcPoints[1].x, 2) + 
        Math.pow(srcPoints[2].y - srcPoints[1].y, 2)
      );
      
      const dstWidth = Math.round(Math.max(widthTop, widthBottom));
      const dstHeight = Math.round(Math.max(heightLeft, heightRight));
      
      // 目标点（矩形）
      const dstPoints = [
        { x: 0, y: 0 },
        { x: dstWidth, y: 0 },
        { x: dstWidth, y: dstHeight },
        { x: 0, y: dstHeight }
      ];
      
      // 计算透视变换矩阵
      const matrix = getPerspectiveTransformMatrix(srcPoints, dstPoints);
      
      // 应用透视变换
      const canvas = processedCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      canvas.width = dstWidth;
      canvas.height = dstHeight;
      
      // 使用像素级变换
      const srcCanvas = document.createElement('canvas');
      const srcCtx = srcCanvas.getContext('2d');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      srcCtx.drawImage(img, 0, 0);
      
      const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
      const dstData = ctx.createImageData(dstWidth, dstHeight);
      
      // 逆向映射
      for (let y = 0; y < dstHeight; y++) {
        for (let x = 0; x < dstWidth; x++) {
          const srcPoint = applyInverseTransform(matrix, x, y);
          
          if (srcPoint.x >= 0 && srcPoint.x < img.width - 1 && 
              srcPoint.y >= 0 && srcPoint.y < img.height - 1) {
            // 双线性插值
            const x0 = Math.floor(srcPoint.x);
            const y0 = Math.floor(srcPoint.y);
            const x1 = x0 + 1;
            const y1 = y0 + 1;
            
            const fx = srcPoint.x - x0;
            const fy = srcPoint.y - y0;
            
            const idx00 = (y0 * img.width + x0) * 4;
            const idx01 = (y0 * img.width + x1) * 4;
            const idx10 = (y1 * img.width + x0) * 4;
            const idx11 = (y1 * img.width + x1) * 4;
            
            const dstIdx = (y * dstWidth + x) * 4;
            
            for (let c = 0; c < 4; c++) {
              const v00 = srcData.data[idx00 + c];
              const v01 = srcData.data[idx01 + c];
              const v10 = srcData.data[idx10 + c];
              const v11 = srcData.data[idx11 + c];
              
              const v0 = v00 * (1 - fx) + v01 * fx;
              const v1 = v10 * (1 - fx) + v11 * fx;
              const v = v0 * (1 - fy) + v1 * fy;
              
              dstData.data[dstIdx + c] = Math.round(v);
            }
          }
        }
      }
      
      ctx.putImageData(dstData, 0, 0);
      
      // 应用文档增强
      if (enhancement.threshold || enhancement.brightness !== 0 || enhancement.contrast !== 0) {
        const enhancedData = ctx.getImageData(0, 0, dstWidth, dstHeight);
        applyDocumentEnhancement(enhancedData);
        ctx.putImageData(enhancedData, 0, 0);
      }
      
      // 转换为 Blob 并更新元素
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          element.set({ src: url });
          
          // 保存到扫描页面列表
          const pageData = {
            id: Date.now(),
            blob: blob,
            width: dstWidth,
            height: dstHeight,
            url: url
          };
          
          setScannedPages(prev => [...prev, pageData]);
          
          // 重置检测
          setDetectedCorners(null);
          setAdjustedCorners(null);
        }
      }, 'image/png');
      
    } catch (error) {
      console.error('透视变换失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // 计算透视变换矩阵
  const getPerspectiveTransformMatrix = (src, dst) => {
    const A = [];
    const b = [];
    
    for (let i = 0; i < 4; i++) {
      A.push([src[i].x, src[i].y, 1, 0, 0, 0, -dst[i].x * src[i].x, -dst[i].x * src[i].y]);
      A.push([0, 0, 0, src[i].x, src[i].y, 1, -dst[i].y * src[i].x, -dst[i].y * src[i].y]);
      b.push(dst[i].x);
      b.push(dst[i].y);
    }
    
    // 使用最小二乘法求解
    const h = solveLinearSystem(A, b);
    
    return [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1]
    ];
  };
  
  // 求解线性方程组
  const solveLinearSystem = (A, b) => {
    // 简化的高斯消元法
    const n = A.length;
    const augmented = A.map((row, i) => [...row, b[i]]);
    
    // 前向消元
    for (let i = 0; i < n; i++) {
      // 选主元
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
      
      // 消元
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
    
    // 回代
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i];
    }
    
    return x;
  };
  
  // 应用逆变换
  const applyInverseTransform = (matrix, x, y) => {
    // 计算逆矩阵
    const det = matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[2][1] * matrix[1][2]) -
                matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
                matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]);
    
    const invMatrix = [
      [
        (matrix[1][1] * matrix[2][2] - matrix[2][1] * matrix[1][2]) / det,
        (matrix[0][2] * matrix[2][1] - matrix[0][1] * matrix[2][2]) / det,
        (matrix[0][1] * matrix[1][2] - matrix[0][2] * matrix[1][1]) / det
      ],
      [
        (matrix[1][2] * matrix[2][0] - matrix[1][0] * matrix[2][2]) / det,
        (matrix[0][0] * matrix[2][2] - matrix[0][2] * matrix[2][0]) / det,
        (matrix[1][0] * matrix[0][2] - matrix[0][0] * matrix[1][2]) / det
      ],
      [
        (matrix[1][0] * matrix[2][1] - matrix[2][0] * matrix[1][1]) / det,
        (matrix[2][0] * matrix[0][1] - matrix[0][0] * matrix[2][1]) / det,
        (matrix[0][0] * matrix[1][1] - matrix[1][0] * matrix[0][1]) / det
      ]
    ];
    
    const w = invMatrix[2][0] * x + invMatrix[2][1] * y + invMatrix[2][2];
    const srcX = (invMatrix[0][0] * x + invMatrix[0][1] * y + invMatrix[0][2]) / w;
    const srcY = (invMatrix[1][0] * x + invMatrix[1][1] * y + invMatrix[1][2]) / w;
    
    return { x: srcX, y: srcY };
  };
  
  // 文档增强
  const applyDocumentEnhancement = (imageData) => {
    const { data } = imageData;
    if (enhancement.threshold) {
      // 使用大津法自动阈值
      let hist = new Array(256).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        hist[gray]++;
      }
      // 大津法
      let total = data.length / 4;
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        let mB = sumB / wB;
        let mF = (sum - sumB) / wF;
        let varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween > varMax) {
          varMax = varBetween;
          threshold = t;
        }
      }
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const value = gray > threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = value;
      }
    } else {
      // 亮度和对比度优化（对比度算法改进）
      const brightness = enhancement.brightness / 100;
      const contrast = enhancement.contrast / 100;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          let value = data[i + c];
          // contrast: y = (x-128)*contrast+128
          value = (value - 128) * (1 + contrast) + 128;
          value = value + brightness * 255;
          data[i + c] = Math.max(0, Math.min(255, value));
        }
      }
    }
  };
  
  // 处理鼠标事件
  const handleMouseDown = (e) => {
    if (!adjustedCorners || !overlayCanvasRef.current) return;
    
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // 检查是否点击了某个角点
    for (let i = 0; i < adjustedCorners.length; i++) {
      const corner = adjustedCorners[i];
      const distance = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
      
      if (distance < 20) {
        setIsDragging(true);
        setDraggedCorner(i);
        break;
      }
    }
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging || draggedCorner === null || !overlayCanvasRef.current) return;
    
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    const newCorners = [...adjustedCorners];
    newCorners[draggedCorner] = { x, y };
    setAdjustedCorners(newCorners);
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedCorner(null);
  };
  
  // 导出所有页面为 PDF (函数声明提前)
  const exportAllPagesAsPDF = async () => {
    if (scannedPages.length === 0) return;
    
    // 这里简化处理，实际项目中应使用 jsPDF 等库来创建多页 PDF
    // 现在我们创建一个包含所有页面的 HTML 文档
    const pdfWindow = window.open('', '_blank');
    pdfWindow.document.write(`
      <html>
        <head>
          <title>Scanned Document</title>
          <style>
            body { margin: 0; padding: 20px; }
            .page { 
              margin-bottom: 20px; 
              page-break-after: always;
              text-align: center;
            }
            img { 
              max-width: 100%; 
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            @media print {
              body { padding: 0; }
              .page { margin: 0; }
            }
          </style>
        </head>
        <body>
    `);
    
    scannedPages.forEach((page, index) => {
      pdfWindow.document.write(`
        <div class="page">
          <img src="${page.url}" alt="Page ${index + 1}" />
        </div>
      `);
    });
    
    pdfWindow.document.write(`
        </body>
      </html>
    `);
    
    pdfWindow.document.close();
    
    // 延迟打印以确保图像加载完成
    setTimeout(() => {
      pdfWindow.print();
    }, 1000);
  };
  
  // 添加新页面
  const addNewPage = () => {
    // 清除当前选择，准备扫描新页面
    setDetectedCorners(null);
    setAdjustedCorners(null);
    
    // 提示用户选择新图像
    alert('请在画布中添加新的图像来扫描下一页');
  };
  
  // 重置扫描
  const resetScan = () => {
    setDetectedCorners(null);
    setAdjustedCorners(null);
    setScannedPages([]);
  };
  
  if (!element || element.type !== 'image') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>请选择一个图像来进行文档扫描</p>
        {scannedPages.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <p>已扫描 {scannedPages.length} 页</p>
            <Button onClick={exportAllPagesAsPDF} intent="primary">
              导出所有页面为 PDF
            </Button>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginBottom: '20px' }}>文档扫描</h3>
      
      {/* Canny 边缘检测结果 - 总是显示 */}
      {cannyResult && (
        <div style={{ 
          marginBottom: '20px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <p style={{ margin: '10px', fontWeight: 'bold' }}>Canny 边缘检测结果：</p>
          <img 
            src={cannyResult}
            alt="Canny Edge Detection"
            style={{ 
              width: '100%', 
              display: 'block',
              background: '#000'
            }}
          />
        </div>
      )}
      
      {/* 四边形检测和调整 */}
      {detectedCorners && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ 
            position: 'relative', 
            border: '1px solid #ccc',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '10px'
          }}>
            <img 
              src={originalImageRef.current?.src} 
              alt="Original" 
              style={{ width: '100%', display: 'block' }}
            />
            <canvas 
              ref={overlayCanvasRef}
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%',
                cursor: isDragging ? 'grabbing' : 'grab'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
          
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
            拖动角点调整文档扫描区域
          </div>
        </div>
      )}
      
      {/* 文档增强选项 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ marginBottom: '10px' }}>文档增强</h4>
        
        <div style={{ marginBottom: '10px' }}>
          <Switch
            checked={enhancement.threshold}
            label="二值化（黑白文档）"
            onChange={(e) => {
              const checked = e.currentTarget?.checked ?? e.target?.checked ?? false;
              setEnhancement(prev => ({
                ...prev,
                threshold: checked
              }));
            }}
          />
        </div>
        
        {!enhancement.threshold && (
          <>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                亮度: {enhancement.brightness}%
              </label>
              <Slider
                min={-50}
                max={50}
                stepSize={1}
                value={enhancement.brightness}
                labelStepSize={25} // 原来可能是1，改为25
                onChange={(value) => setEnhancement(prev => ({
                  ...prev,
                  brightness: value
                }))}
              />
            </div>
            
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                对比度: {enhancement.contrast}%
              </label>
              <Slider
                min={-50}
                max={50}
                stepSize={1}
                value={enhancement.contrast}
                labelStepSize={25} // 原来可能是1，改为25
                onChange={(value) => setEnhancement(prev => ({
                  ...prev,
                  contrast: value
                }))}
              />
            </div>
          </>
        )}
      </div>
      
      {/* 操作按钮 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {adjustedCorners && (
          <Button 
            onClick={perspectiveTransform}
            loading={isProcessing}
            intent="primary"
            large
          >
            矫正文档
          </Button>
        )}
        
        {scannedPages.length > 0 && (
          <>
            <Button 
              onClick={addNewPage}
              intent="success"
            >
              添加新页面 ({scannedPages.length} 页已扫描)
            </Button>
            
            <Button 
              onClick={exportAllPagesAsPDF}
              intent="primary"
            >
              导出为 PDF
            </Button>
          </>
        )}
        
        {(detectedCorners || scannedPages.length > 0) && (
          <Button 
            onClick={resetScan}
            minimal
          >
            重置扫描
          </Button>
        )}
      </div>
      
      {/* 帮助信息 */}
      <div style={{ 
        backgroundColor: '#f5f5f5', 
        padding: '15px', 
        borderRadius: '5px',
        marginTop: '20px',
        fontSize: '12px'
      }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>新算法说明：</p>
        <ol style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>Canny边缘检测</strong>：自动显示边缘检测结果</li>
          <li><strong>连通分量分析</strong>：提取所有背景连通区域</li>
          <li><strong>最大区域检测</strong>：找到面积最大的连通分量</li>
          <li><strong>外接四边形</strong>：生成最大区域的外接矩形作为文档边界</li>
          <li><strong>角点调整</strong>：可拖动四个角点微调扫描区域</li>
          <li><strong>OTSU二值化</strong>：启用"二值化"时自动应用大津法阈值</li>
        </ol>
      </div>
      
      {/* 隐藏的画布 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={edgeCanvasRef} style={{ display: 'none' }} />
      <canvas ref={overlayCanvasRef} style={{ display: 'none' }} />
      <canvas ref={processedCanvasRef} style={{ display: 'none' }} />
    </div>
  );
});

// 文档扫描图标
const DocumentScanIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M7 3H5C3.9 3 3 3.9 3 5V7H5V5H7V3ZM17 3V5H19V7H21V5C21 3.9 20.1 3 19 3H17ZM19 17V19H17V21H19C20.1 21 21 20.1 21 19V17H19ZM7 21V19H5V17H3V19C3 20.1 3.9 21 5 21H7Z" />
    <path d="M8 6H16V10H8V6ZM8 12H16V14H8V12ZM8 16H13V18H8V16Z" opacity="0.6"/>
  </svg>
);

// 导出文档扫描的 SectionTab 配置
export const DocumentScannerSection = {
  name: 'document-scanner',
  Tab: (props) => (
    <SectionTab name="文档扫描" {...props}>
      <DocumentScanIcon />
    </SectionTab>
  ),
  Panel: DocumentScannerPanel,
};