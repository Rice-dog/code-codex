// constants responsibility; original state keys, defaults and lifecycle retained.
import {
  PARTICLE_BACKGROUND_STORE,
  type ParticleImageRecord
} from "../../particle-image-startup";















// Independently implemented from the public Particle Image interaction concept
// by React Bits / David Haz; no React Bits Pro source or assets are intentionally included.
// See THIRD_PARTY_NOTICES_EN.md and THIRD_PARTY_NOTICES_ZH_CN.md.




















export function saveParticleImageRecord(database: IDBDatabase,record: ParticleImageRecord): Promise<void> {
  return new Promise((resolve,reject) => {
    const transaction=database.transaction(PARTICLE_BACKGROUND_STORE,"readwrite");
    transaction.objectStore(PARTICLE_BACKGROUND_STORE).put(record);
    transaction.addEventListener("complete",() => resolve(),{ once: true });
    transaction.addEventListener("abort",() => reject(transaction.error??new Error("The image could not be saved")),{ once: true });
    transaction.addEventListener("error",() => reject(transaction.error??new Error("The image could not be saved")),{ once: true });
  });
}



export function deleteParticleImageRecord(database: IDBDatabase,id: string): Promise<void> {
  return new Promise((resolve,reject) => {
    const transaction=database.transaction(PARTICLE_BACKGROUND_STORE,"readwrite");
    transaction.objectStore(PARTICLE_BACKGROUND_STORE).delete(id);
    transaction.addEventListener("complete",() => resolve(),{ once: true });
    transaction.addEventListener("abort",() => reject(transaction.error??new Error("The image could not be deleted")),{ once: true });
    transaction.addEventListener("error",() => reject(transaction.error??new Error("The image could not be deleted")),{ once: true });
  });
}



export async function createParticleThumbnail(source: Blob): Promise<Blob> {
  const bitmap=await createImageBitmap(source);
  try {
    const scale=Math.min(1,180/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement("canvas");
    canvas.width=width;
    canvas.height=height;
    const context=canvas.getContext("2d",{ willReadFrequently: true });
    if(!context) throw new Error("The thumbnail canvas is unavailable");
    context.drawImage(bitmap,0,0,width,height);
    const imageData=context.getImageData(0,0,width,height);
    const pixels=imageData.data;
    for(let offset=0;offset<pixels.length;offset+=4) {
      const luminance=Math.round(
        (pixels[offset]??0)*0.2126+(pixels[offset+1]??0)*0.7152+(pixels[offset+2]??0)*0.0722,
      );
      pixels[offset]=luminance;
      pixels[offset+1]=luminance;
      pixels[offset+2]=luminance;
    }
    context.putImageData(imageData,0,0);
    return await new Promise<Blob>((resolve,reject) => {
      canvas.toBlob((blob) => blob? resolve(blob):reject(new Error("The thumbnail could not be created")),"image/png",0.82);
    });
  } finally {
    bitmap.close();
  }
}
