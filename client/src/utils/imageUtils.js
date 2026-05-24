export const MAX_PHOTO_SIZE = 640;
export const JPEG_QUALITY = 0.4;

/**
 * Compress a File/Blob to a JPEG data-URL, resizing so neither dimension
 * exceeds `maxSize` pixels while preserving aspect ratio.
 */
export function compressPhoto(file, maxSize = MAX_PHOTO_SIZE, quality = JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}
