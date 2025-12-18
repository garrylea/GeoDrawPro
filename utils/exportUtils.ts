
import { Shape } from '../types';

// Helper to detect if running in Electron renderer
export const isElectron = () => {
  return typeof window !== 'undefined' && 
         (window as any).process && 
         (window as any).process.type === 'renderer';
};

/**
 * Safely converts Uint8Array to Base64 string without blowing the stack.
 */
const uint8ArrayToBase64 = (array: Uint8Array): string => {
    let binary = '';
    const len = array.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(array[i]);
    }
    return btoa(binary);
};

/**
 * Packs multiple PNG buffers into a single ICO file buffer.
 */
const createIcoBuffer = (pngDatas: { size: number, data: Uint8Array }[]): ArrayBuffer => {
    const headerSize = 6;
    const dirEntrySize = 16;
    const totalHeaderSize = headerSize + (dirEntrySize * pngDatas.length);
    
    let totalDataSize = 0;
    pngDatas.forEach(p => totalDataSize += p.data.length);

    const buffer = new ArrayBuffer(totalHeaderSize + totalDataSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // ICO Header
    view.setUint16(0, 0, true);    // Reserved
    view.setUint16(2, 1, true);    // Type 1 = ICO
    view.setUint16(4, pngDatas.length, true); // Image count

    let currentOffset = totalHeaderSize;

    pngDatas.forEach((png, i) => {
        const entryOffset = headerSize + (i * dirEntrySize);
        const size = png.size >= 256 ? 0 : png.size;
        
        view.setUint8(entryOffset + 0, size); // Width
        view.setUint8(entryOffset + 1, size); // Height
        view.setUint8(entryOffset + 2, 0);    // Color palette
        view.setUint8(entryOffset + 3, 0);    // Reserved
        view.setUint16(entryOffset + 4, 1, true);  // Color planes
        view.setUint16(entryOffset + 6, 32, true); // Bits per pixel
        view.setUint32(entryOffset + 8, png.data.length, true); // Data size
        view.setUint32(entryOffset + 12, currentOffset, true);  // Data offset

        bytes.set(png.data, currentOffset);
        currentOffset += png.data.length;
    });

    return buffer;
};

/**
 * Packs multiple PNG buffers into a single ICNS file buffer (Apple Icon Image).
 */
const createIcnsBuffer = (pngDatas: { size: number, data: Uint8Array }[]): ArrayBuffer => {
    const ICNS_TYPES: Record<number, string> = {
        16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 
        256: 'ic08', 512: 'ic09', 1024: 'ic10'
    };

    let totalSize = 8; // 'icns' + length
    const validIcons = pngDatas.filter(p => ICNS_TYPES[p.size]);
    validIcons.forEach(p => totalSize += (8 + p.data.length));

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // ICNS Header
    bytes.set([105, 99, 110, 115], 0); // 'icns'
    view.setUint32(4, totalSize, false); // Big-endian total size

    let offset = 8;
    validIcons.forEach(png => {
        const typeStr = ICNS_TYPES[png.size];
        for (let i = 0; i < 4; i++) {
            bytes[offset + i] = typeStr.charCodeAt(i);
        }
        view.setUint32(offset + 4, png.data.length + 8, false);
        bytes.set(png.data, offset + 8);
        offset += (png.data.length + 8);
    });

    return buffer;
};

/**
 * Triggers a browser download for a blob.
 */
const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const exportCanvas = (svgElement: SVGSVGElement, format: 'png' | 'jpeg', filename: string) => {
  const shapeGroups = svgElement.querySelectorAll('.shape-group');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  if (shapeGroups.length > 0) {
      const svgRect = svgElement.getBoundingClientRect();
      shapeGroups.forEach(g => {
          const rect = g.getBoundingClientRect();
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
      const rect = svgElement.getBoundingClientRect();
      minX = 0; minY = 0; maxX = rect.width; maxY = rect.height;
  }

  const padding = 40;
  minX = Math.floor(minX - padding);
  minY = Math.floor(minY - padding);
  maxX = Math.ceil(maxX + padding);
  maxY = Math.ceil(maxY + padding);

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgElement);

  const parser = new DOMParser();
  const doc = parser.parseFromString(source, "image/svg+xml");
  const svgRoot = doc.documentElement;

  const bgRect = svgRoot.querySelector('rect[width="100%"][height="100%"]');
  if (bgRect) {
      bgRect.setAttribute('x', `${minX}`);
      bgRect.setAttribute('y', `${minY}`);
      bgRect.setAttribute('width', `${width}`);
      bgRect.setAttribute('height', `${height}`);
  }

  svgRoot.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
  svgRoot.setAttribute('width', `${width}`);
  svgRoot.setAttribute('height', `${height}`);

  if (!svgRoot.getAttribute('xmlns')) {
      svgRoot.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  source = serializer.serializeToString(svgRoot);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;

  if (context) {
    context.scale(scale, scale);
    if (format === 'jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
    }
  }

  const imgSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
  const image = new Image();

  image.onload = () => {
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

/**
 * Renders an SVG (from canvas or URL) to multiple PNG buffers and packages them.
 */
export const exportAppIcon = async (svgSource: SVGSVGElement | string, format: 'ico' | 'icns' | 'png') => {
    const sizes = format === 'ico' 
        ? [16, 32, 48, 64, 128, 256] 
        : format === 'icns' 
            ? [16, 32, 64, 128, 256, 512, 1024]
            : [512]; // Linux standard single high-res png

    let svgText = '';
    try {
        if (typeof svgSource === 'string') {
            const response = await fetch(svgSource);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} when fetching ${svgSource}`);
            svgText = await response.text();
        } else {
            svgText = new XMLSerializer().serializeToString(svgSource);
        }
    } catch (err) {
        console.error("Failed to fetch/serialize SVG source:", err);
        alert(`Failed to load icon source. If you are in Electron, please check if the path is relative. Error: ${err.message}`);
        return;
    }

    const imgSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    const image = new Image();
    image.src = imgSrc;

    try {
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = (e) => reject(new Error("Image failed to load: " + e));
        });
    } catch (err) {
        console.error("Failed to render icon source to image object:", err);
        alert("Failed to process icon graphics.");
        return;
    }

    const iconData = await Promise.all(sizes.map(async (size) => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(image, 0, 0, size, size);
        }
        
        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
        if (!blob) throw new Error(`Failed to render icon size ${size}`);
        
        const arrayBuffer = await blob.arrayBuffer();
        return { size, data: new Uint8Array(arrayBuffer) };
    }));

    if (isElectron()) {
        const base64Icons = iconData.map(icon => ({
            size: icon.size,
            // CRITICAL FIX: Use the robust helper instead of spread operator to avoid stack overflow for 1024x1024 icons
            base64: uint8ArrayToBase64(icon.data)
        }));
        try {
            const { ipcRenderer } = (window as any).require('electron');
            const result = await ipcRenderer.invoke('EXPORT_APP_ICON', { format, icons: base64Icons });
            if (result.error) alert("Failed to export icon: " + result.error);
        } catch (err) {
            console.error("Electron IPC failed:", err);
            alert("IPC Error: Icon could not be saved to disk.");
        }
    } else {
        if (format === 'png') {
            const blob = new Blob([iconData[0].data], { type: 'image/png' });
            triggerDownload(blob, `app-icon-linux.png`);
        } else {
            const buffer = format === 'ico' ? createIcoBuffer(iconData) : createIcnsBuffer(iconData);
            const blob = new Blob([buffer], { type: format === 'ico' ? 'image/x-icon' : 'image/x-icns' });
            triggerDownload(blob, `app-icon.${format}`);
        }
    }
};

export const saveProject = async (shapes: Shape[], filename: string) => {
    const data = JSON.stringify(shapes, null, 2);

    if (isElectron()) {
        try {
            const { ipcRenderer } = (window as any).require('electron');
            const result = await ipcRenderer.invoke('save-dialog', data);
            if (!result.success && result.error) {
                alert('Failed to save project: ' + result.error);
            }
        } catch (e) {
            console.error('Electron Save Error:', e);
            alert('An error occurred while saving.');
        }
    } else {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.geo`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

export const loadProject = (file?: File): Promise<Shape[]> => {
    return new Promise(async (resolve, reject) => {
        if (isElectron() && !file) {
            try {
                const { ipcRenderer } = (window as any).require('electron');
                const result = await ipcRenderer.invoke('open-dialog');
                if (result.canceled) return;
                if (result.error) throw new Error(result.error);
                const shapes = JSON.parse(result.data);
                if (Array.isArray(shapes)) { resolve(shapes); } 
                else { reject(new Error("Invalid file format")); }
            } catch (e) { reject(e); }
        } else {
            if (!file) { reject(new Error("No file provided")); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const result = e.target?.result as string;
                    const shapes = JSON.parse(result);
                    if (Array.isArray(shapes)) { resolve(shapes); } 
                    else { reject(new Error("Invalid file format")); }
                } catch (err) { reject(err); }
            };
            reader.readAsText(file);
        }
    });
};
