# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React-based digital image processing application built on top of the Polotno canvas editor framework. The application provides various image processing effects and filters, including sharpening, smoothing, document scanning, whitening, histogram operations, and more.

## Key Commands

- **Development**: `npm start` - Starts the development server
- **Build**: `npm run build` - Creates a production build
- **Test**: `npm test --env=jsdom` - Runs tests in jsdom environment
- **TypeScript**: `npm run build` (TypeScript compilation is handled by react-scripts)

## Architecture

### Core Framework
- **Polotno**: Canvas editor framework that provides the main UI structure
- **React 18.2.0**: UI framework with hooks and functional components
- **Blueprint.js**: UI component library for consistent styling

### Application Structure
- **Main App** (`src/index.js`): Sets up the Polotno container with custom sections
- **Store**: Uses Polotno's createStore with API key for canvas state management
- **Side Panel**: Custom sections are added to the default Polotno side panel

### Custom Effect Sections
Each image processing effect is implemented as a separate section following this pattern:
- **Panel Component**: Observer component that handles the effect logic
- **Icon Component**: SVG icon for the side panel tab
- **Section Export**: Object with `name`, `Tab`, and `Panel` properties

Key sections include:
- `SharpnessSection`: Laplacian, Sobel, and Unsharp Mask algorithms
- `DocumentScannerSection`: Canny edge detection and perspective transformation
- `SmoothingSection`: Skin smoothing effects
- `WhiteningSection`: Skin whitening effects
- `ImHistSection`: Histogram analysis and visualization
- `BWAndFiltersSection`: Black & white and color filters
- `HistogramEnhancementSection`: Histogram equalization and enhancement

### Image Processing Patterns
1. **Canvas-based Processing**: All effects use HTML5 Canvas for pixel manipulation
2. **Original Image Preservation**: Effects maintain a reference to the original image
3. **Real-time Sliders**: Most effects use Blueprint.js Slider components for parameters
4. **Blob/URL Management**: Processed images are converted to blobs and object URLs
5. **Algorithm Selection**: Many effects offer multiple algorithm choices via RadioGroup

### State Management
- **MobX**: Used with Polotno store for reactive state management
- **React Hooks**: useState, useEffect, useRef for component state
- **Observer Pattern**: Components wrapped with `observer` from mobx-react-lite

### Canvas Operations
- **Image Loading**: Cross-origin enabled for external images
- **Pixel Manipulation**: Direct ImageData manipulation for effects
- **Convolution Kernels**: Used for sharpening, edge detection, and filtering
- **Morphological Operations**: Erosion, dilation, opening, closing for document scanning

## Development Guidelines

### Adding New Effects
1. Create a new file in `src/` following the naming pattern `[EffectName]Effect.js`
2. Implement the Panel component as an observer with proper image validation
3. Add algorithm implementations using canvas ImageData operations
4. Create a custom icon component
5. Export the section object and add it to the sections array in `index.js`

### Image Processing Best Practices
- Always validate that the selected element is an image before processing
- Preserve the original image reference for reset functionality
- Use canvas operations for pixel-level transformations
- Implement proper error handling for image loading and processing
- Add loading states for intensive operations

### UI Consistency
- Use Blueprint.js components (Button, Slider, RadioGroup, Switch)
- Follow the existing styling patterns for panels
- Include help text and algorithm descriptions
- Implement proper hover and loading states

## Technical Notes

### Performance Considerations
- Large images are scaled down for processing when necessary
- Canvas operations are performed on separate hidden canvases
- Heavy computations use try-catch blocks with loading states

### Cross-Origin Issues
- Images are loaded with `crossOrigin = 'anonymous'`
- Blob URLs are used for processed images to avoid CORS issues

### Algorithm Implementations
- Canny edge detection with non-maximum suppression
- Perspective transformation using homographic matrices
- Bilateral filtering for noise reduction
- Otsu's method for automatic thresholding
- Various convolution kernels for different effects