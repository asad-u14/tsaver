import { statSync } from "node:fs";
import { extname } from "node:path";
import { Jimp } from "jimp";
const MAX_DIMENSION = 1024;
export async function optimizeImage(path) {
    const originalBytes = statSync(path).size;
    const image = await Jimp.read(path);
    const { width, height } = image;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        image.resize({ w: Math.round(width * scale), h: Math.round(height * scale) });
    }
    const ext = extname(path);
    const base = path.slice(0, path.length - ext.length);
    const outputPath = `${base}.optimized${ext}`;
    await image.write(outputPath);
    const optimizedBytes = statSync(outputPath).size;
    return {
        outputPath,
        originalBytes,
        optimizedBytes,
        originalWidth: width,
        originalHeight: height,
        newWidth: image.width,
        newHeight: image.height,
    };
}
