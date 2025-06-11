import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Slider, RadioGroup, Radio, Switch } from '@blueprintjs/core';
import { SectionTab } from 'polotno/side-panel';

// 文档扫描面板组件
export const DocumentScannerPanel = observer(({ store }) => {
  const element = store.selectedElements[0];
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState(null);
  const [adjustedCorners, setAdjustedCorners] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedCorner, setDraggedCorner] = useState(null);
  const [scanMode, setScanMode] = useState('auto'); // auto, manual
  const [showEdges, setShowEdges] = useState(false);
  const [enhancement, setEnhancement] = useState({
    brightness: 20,
    contrast: 30,
    threshold: false
  });
  const [scannedPages, setScannedPages] = useState([]);
  
  const canvasRef = useRef(null);
  const edgeCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const processedCanvasRef = useRef(null);
  const originalImageRef = useRef(null);
  
  // 当选中元素改变时，保存原始图像
  useEffect(() => {
    if (element && element.type === 'image' && element.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        originalImageRef.current = img;
        if (scanMode === 'auto') {
          detectDocumentEdges();
        }
      };
      img.src = element.src;
    }
  }, [element?.src]);
  
  // 高斯模糊
  const gaussianBlur = (data, width, height) => {
    const kernel = [
      1/16, 2/16, 1/16,
      2/16, 4/16, 2/16,
      1/16, 2/16, 1/16
    ];
    const output = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        let kernelIdx = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            sum += data[idx] * kernel[kernelIdx++];
          }
        }
        
        output[y * width + x] = sum;
      }
    }
    
    return output;
  };
  
  // Sobel 算子
  const sobelOperator = (data, width, height) => {
    const gx = new Float32Array(width * height);
    const gy = new Float32Array(width * height);
    const magnitude = new Float32Array(width * height);
    const direction = new Float32Array(width * height);
    
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sumX = 0, sumY = 0;
        let kernelIdx = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            sumX += data[idx] * sobelX[kernelIdx];
            sumY += data[idx] * sobelY[kernelIdx];
            kernelIdx++;
          }
        }
        
        const idx = y * width + x;
        gx[idx] = sumX;
        gy[idx] = sumY;
        magnitude[idx] = Math.sqrt(sumX * sumX + sumY * sumY);
        direction[idx] = Math.atan2(sumY, sumX);
      }
    }
    
    return { magnitude, direction };
  };
  
  // 非极大值抑制
  const nonMaximumSuppression = (magnitude, direction, width, height) => {
    const output = new Float32Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const angle = direction[idx];
        const mag = magnitude[idx];
        
        let n1, n2;
        
        // 根据梯度方向确定邻居
        if ((angle >= -Math.PI/8 && angle < Math.PI/8) || 
            (angle >= 7*Math.PI/8) || (angle < -7*Math.PI/8)) {
          n1 = magnitude[idx - 1];
          n2 = magnitude[idx + 1];
        } else if ((angle >= Math.PI/8 && angle < 3*Math.PI/8) || 
                   (angle >= -7*Math.PI/8 && angle < -5*Math.PI/8)) {
          n1 = magnitude[idx - width + 1];
          n2 = magnitude[idx + width - 1];
        } else if ((angle >= 3*Math.PI/8 && angle < 5*Math.PI/8) || 
                   (angle >= -5*Math.PI/8 && angle < -3*Math.PI/8)) {
          n1 = magnitude[idx - width];
          n2 = magnitude[idx + width];
        } else {
          n1 = magnitude[idx - width - 1];
          n2 = magnitude[idx + width + 1];
        }
        
        if (mag >= n1 && mag >= n2) {
          output[idx] = mag;
        }
      }
    }
    
    return output;
  };
  
  // 双阈值检测
  const doubleThreshold = (data, width, height, lowThreshold, highThreshold) => {
    const edges = new Uint8ClampedArray(width * height);
    const strong = 255;
    const weak = 75;
    
    // 标记强边缘和弱边缘
    for (let i = 0; i < data.length; i++) {
      if (data[i] >= highThreshold) {
        edges[i] = strong;
      } else if (data[i] >= lowThreshold) {
        edges[i] = weak;
      }
    }
    
    // 边缘追踪
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (edges[idx] === weak) {
          // 检查8个邻居是否有强边缘
          let hasStrongNeighbor = false;
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              
              const neighborIdx = (y + dy) * width + (x + dx);
              if (edges[neighborIdx] === strong) {
                hasStrongNeighbor = true;
                break;
              }
            }
            if (hasStrongNeighbor) break;
          }
          
          edges[idx] = hasStrongNeighbor ? strong : 0;
        }
      }
    }
    
    return edges;
  };
  
  // Canny 边缘检测
  const cannyEdgeDetection = (imageData) => {
    const { data, width, height } = imageData;
    const grayscale = new Uint8ClampedArray(width * height);
    
    // 转换为灰度图
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayscale[i / 4] = gray;
    }
    
    // 高斯模糊
    const blurred = gaussianBlur(grayscale, width, height);
    
    // Sobel 算子计算梯度
    const { magnitude, direction } = sobelOperator(blurred, width, height);
    
    // 非极大值抑制
    const suppressed = nonMaximumSuppression(magnitude, direction, width, height);
    
    // 双阈值检测
    const edges = doubleThreshold(suppressed, width, height, 30, 100);
    
    return edges;
  };
  
  // 查找轮廓
  const findContours = (edges, width, height) => {
    const visited = new Uint8Array(width * height);
    const contours = [];
    
    // 8方向邻居
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    
    // DFS查找连通区域
    const dfs = (startX, startY) => {
      const contour = [];
      const stack = [[startX, startY]];
      
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;
        
        if (visited[idx]) continue;
        visited[idx] = 1;
        
        if (edges[idx] > 0) {
          contour.push({ x, y });
          
          // 检查所有邻居
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
      }
      
      return contour;
    };
    
    // 查找所有轮廓
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && edges[idx] > 0) {
          const contour = dfs(x, y);
          if (contour.length > 10) { // 忽略太小的轮廓
            contours.push(contour);
          }
        }
      }
    }
    
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
    
    // 检查所有内角是否小于180度
    for (let i = 0; i < 4; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % 4];
      const p3 = points[(i + 2) % 4];
      
      const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
      
      const cross = v1.x * v2.y - v1.y * v2.x;
      
      if (i === 0) {
        const sign = cross > 0;
        continue;
      }
      
      if ((cross > 0) !== (i === 0 ? cross > 0 : true)) {
        return false;
      }
    }
    
    return true;
  };
  
  // 检测文档边缘
  const detectDocumentEdges = async () => {
    if (!originalImageRef.current) return;
    
    setIsProcessing(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = originalImageRef.current;
      
      // 缩放图像以提高处理速度
      const maxSize = 600;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const width = Math.floor(img.width * scale);
      const height = Math.floor(img.height * scale);
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const edges = cannyEdgeDetection(imageData);
      
      // 显示边缘检测结果
      if (showEdges) {
        const edgeCanvas = edgeCanvasRef.current;
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
      }
      
      // 查找轮廓
      const contours = findContours(edges, width, height);
      
      // 找到最大的四边形
      const quad = findLargestQuadrilateral(contours, width, height);
      
      if (quad && quad.length === 4) {
        // 将角点坐标转换回原始图像尺寸
        const scaledCorners = quad.map(corner => ({
          x: corner.x / scale,
          y: corner.y / scale
        }));
        
        // 按顺时针顺序排列角点
        const sortedCorners = sortCorners(scaledCorners);
        
        setDetectedCorners(sortedCorners);
        setAdjustedCorners(sortedCorners);
        
        // 绘制检测结果
        drawOverlay();
      } else {
        // 如果检测失败，使用默认的四个角
        const defaultCorners = [
          { x: img.width * 0.1, y: img.height * 0.1 },
          { x: img.width * 0.9, y: img.height * 0.1 },
          { x: img.width * 0.9, y: img.height * 0.9 },
          { x: img.width * 0.1, y: img.height * 0.9 }
        ];
        setDetectedCorners(defaultCorners);
        setAdjustedCorners(defaultCorners);
        drawOverlay();
      }
      
    } catch (error) {
      console.error('边缘检测失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
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
      // 自适应阈值二值化
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const value = gray > 128 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = value;
      }
    } else {
      // 亮度和对比度调整
      const brightness = enhancement.brightness / 100;
      const contrast = enhancement.contrast / 100;
      
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          let value = data[i + c];
          
          // 应用对比度
          value = ((value / 255 - 0.5) * (1 + contrast) + 0.5) * 255;
          
          // 应用亮度
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
      
      {/* 扫描模式选择 */}
      <div style={{ marginBottom: '20px' }}>
        <RadioGroup
          label="扫描模式"
          onChange={(e) => {
            setScanMode(e.currentTarget.value);
            if (e.currentTarget.value === 'auto' && originalImageRef.current) {
              detectDocumentEdges();
            }
          }}
          selectedValue={scanMode}
        >
          <Radio label="自动检测边缘" value="auto" />
          <Radio label="手动调整" value="manual" />
        </RadioGroup>
      </div>
      
      {/* 显示边缘检测结果 */}
      <div style={{ marginBottom: '10px' }}>
        <Switch
          checked={showEdges}
          label="显示 Canny 边缘检测结果"
          onChange={(e) => {
            setShowEdges(e.currentTarget.checked);
            if (e.currentTarget.checked && originalImageRef.current) {
              detectDocumentEdges();
            }
          }}
        />
      </div>
      
      {/* Canny 边缘检测结果显示 */}
      {showEdges && (
        <div style={{ 
          marginBottom: '20px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <p style={{ margin: '10px', fontWeight: 'bold' }}>Canny 边缘检测结果：</p>
          <canvas 
            ref={edgeCanvasRef}
            style={{ 
              width: '100%', 
              display: 'block',
              background: '#000'
            }}
          />
        </div>
      )}
      
      {/* 边缘检测和调整 */}
      {(detectedCorners || scanMode === 'manual') && (
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
            拖动角点调整扫描区域
          </div>
          
          {scanMode === 'manual' && !adjustedCorners && (
            <Button 
              onClick={() => {
                const img = originalImageRef.current;
                const defaultCorners = [
                  { x: img.width * 0.1, y: img.height * 0.1 },
                  { x: img.width * 0.9, y: img.height * 0.1 },
                  { x: img.width * 0.9, y: img.height * 0.9 },
                  { x: img.width * 0.1, y: img.height * 0.9 }
                ];
                setAdjustedCorners(defaultCorners);
              }}
              intent="primary"
              style={{ marginBottom: '10px' }}
            >
              设置默认边框
            </Button>
          )}
        </div>
      )}
      
      {/* 文档增强选项 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ marginBottom: '10px' }}>文档增强</h4>
        
        <div style={{ marginBottom: '10px' }}>
          <Switch
            checked={enhancement.threshold}
            label="二值化（黑白文档）"
            onChange={(e) => setEnhancement(prev => ({
              ...prev,
              threshold: e.currentTarget.checked
            }))}
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
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>使用说明：</p>
        <ol style={{ margin: '0', paddingLeft: '20px' }}>
          <li>选择一张包含文档的图像</li>
          <li>系统会自动检测文档边缘，或手动调整四个角点</li>
          <li>可以查看 Canny 边缘检测的结果</li>
          <li>设置文档增强选项（可选）</li>
          <li>点击"矫正文档"进行透视变换</li>
          <li>可以继续添加更多页面，最后导出为 PDF</li>
        </ol>
      </div>
      
      {/* 隐藏的画布 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
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