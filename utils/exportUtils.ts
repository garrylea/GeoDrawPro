/**
 * Exports an SVG element to a PNG or JPG file.
 * Crops the output to the bounding box of the drawn shapes + padding.
 */
export const exportCanvas = (svgElement: SVGSVGElement, format: 'png' | 'jpeg', filename: string) => {
  // 1. Calculate Content Bounding Box
  const shapeGroups = svgElement.querySelectorAll('.shape-group');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  if (shapeGroups.length > 0) {
      const svgRect = svgElement.getBoundingClientRect();
      shapeGroups.forEach(g => {
          const rect = g.getBoundingClientRect();
          // Convert to SVG local coordinates relative to the viewport origin (top-left of SVG)
          const x1 = rect.left - svgRect.left;
          const y1 = rect.top - svgRect.top;
          const x2 = rect.right - svgRect.left;
          const y2 = rect.bottom - svgRect.top;
          
          if (x1 < minX) minX = x1;
          if (y1 < minY) minY = y1;
          if (x2 > maxX) maxX = x2;
          if (y2 > maxY) maxY = y2;
      });
  } else {
      // Fallback: Use full canvas if no shapes are present
      const rect = svgElement.getBoundingClientRect();
      minX = 0; minY = 0; maxX = rect.width; maxY = rect.height;
  }

  // Add Padding
  const padding = 40;
  minX = Math.floor(minX - padding);
  minY = Math.floor(minY - padding);
  maxX = Math.ceil(maxX + padding);
  maxY = Math.ceil(maxY + padding);

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  // 2. Serialize and Adjust SVG
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgElement);

  // Parse to DOM to safely manipulate attributes for cropping
  const parser = new DOMParser();
  const doc = parser.parseFromString(source, "image/svg+xml");
  const svgRoot = doc.documentElement;

  // Fix: The background rect (width="100%") does not automatically adjust to the new viewBox origin/size
  // when we crop. We must explicitly set it to cover the cropped area.
  // This prevents the "partially transparent, partially white" glitch.
  const bgRect = svgRoot.querySelector('rect[width="100%"][height="100%"]');
  if (bgRect) {
      bgRect.setAttribute('x', `${minX}`);
      bgRect.setAttribute('y', `${minY}`);
      bgRect.setAttribute('width', `${width}`);
      bgRect.setAttribute('height', `${height}`);
  }

  // Set viewBox to crop the image to the calculated bounds
  svgRoot.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
  svgRoot.setAttribute('width', `${width}`);
  svgRoot.setAttribute('height', `${height}`);

  // Ensure namespaces exist
  if (!svgRoot.getAttribute('xmlns')) {
      svgRoot.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  // Re-serialize the cropped SVG
  source = serializer.serializeToString(svgRoot);

  // 3. Render to Canvas
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  // Scale up for high resolution export
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;

  if (context) {
    context.scale(scale, scale);
    // Fill white background for JPEG
    if (format === 'jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
    }
  }

  const imgSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
  const image = new Image();

  image.onload = () => {
    // Draw image at 0,0 with calculated width/height.
    // Since viewBox is set, the browser renders the cropped view into this rect.
    context?.drawImage(image, 0, 0, width, height);
    
    const imgUrl = canvas.toDataURL(`image/${format}`, 0.9);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = imgUrl;
    downloadLink.download = `${filename}.${format}`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };
  
  image.onerror = (e) => {
      console.error('Export failed:', e);
      alert('Failed to generate image for export.');
  };

  image.src = imgSrc;
};