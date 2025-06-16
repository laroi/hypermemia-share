import express from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { MongoClient, ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 4006;

(async()=>{
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('Error: MONGO_URI environment variable is not set.');
    process.exit(1);
  }

  const DB_NAME = 'trolls';
  const COLLECTION_NAME = 'posts';

  const client = new MongoClient(MONGO_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  const posts = db.collection(COLLECTION_NAME);

  app.get('/quickshare/:id', async (req, res) => {
    const { id } = req.params;
    const { s, t="" } = req.query;
    const post = await posts.findOne({ _id: new ObjectId(id) });
    const imagePath = path.join('.', post.image.url)
    
    try {
      const imageBuffer = await fs.readFile(imagePath);
      const inputImage = await sharp(imageBuffer)
      const metadata = await inputImage.metadata();  
      const fullWidth = metadata.width;
      const fullHeight = metadata.height;
      let baseImageBuffer = imageBuffer;
      let totalCroppedHeight = fullHeight;
      let textHeight = 0;
      if (s) {
        // Dynamic number of sections (up to 3)
        const sectionFlags = s.slice(0, 3).split('');
        const numSections = sectionFlags.length;
        const sliceHeight = Math.floor(fullHeight / numSections);
  
        // Extract and include only flagged sections
        const slices = await Promise.all(sectionFlags.map(async (flag, index) => {
          if (flag === '1') {
            return await sharp(imagePath)
              .extract({
                left: 0,
                top: index * sliceHeight,
                width: fullWidth,
                height: sliceHeight
              })
              .toBuffer();
          }
          return null;
        }));
  
        const validSlices = slices.filter(Boolean);
  
        totalCroppedHeight = sliceHeight * validSlices.length;
      
        // Combine vertically
        baseImageBuffer = sharp({
          create: {
            width: fullWidth,
            height: totalCroppedHeight,
            channels: 3,
            background: '#000'
          }
        }).composite(
          validSlices.map((buffer, i) => ({
            input: buffer,
            top: i * sliceHeight,
            left: 0
          }))
        );
        baseImageBuffer = await baseImageBuffer.jpeg().toBuffer();
      }
      // Add text if provided
      if (t.trim() !== '') {
        textHeight = 100;
        const svgText = `
          <svg width="${fullWidth}" height="${textHeight}">
            <rect width="100%" height="100%" fill="black"/>
            <text x="50%" y="65%" font-size="40" fill="white" text-anchor="middle"
              dominant-baseline="middle" font-family="sans-serif">${t}</text>
          </svg>
        `;

        const withText = sharp({
          create: {
            width: fullWidth,
            height: totalCroppedHeight + textHeight,
            channels: 3,
            background: '#000'
          }
        }).composite([
          { input: baseImageBuffer, top: 0, left: 0 },
          { input: Buffer.from(svgText), top: totalCroppedHeight, left: 0 }
        ]);
        baseImageBuffer = await withText.jpeg().toBuffer();
      } 
  
      const finalImageBuffer = await sharp(baseImageBuffer)
        .resize({ height: 630, withoutEnlargement: true })        
        .jpeg({ quality: 80 })
        .toBuffer();

      const guid = uuidv4();
      const outputFilePath = path.join(path.resolve(), 'generated', `${guid}.jpg`);

      sharp(finalImageBuffer)
      .toFile(outputFilePath)
      .then(() => console.log('Image saved:', outputFilePath))
      .catch((err) => console.error('Failed to save image:', err));
      const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:image" content="/quickshare/generated/${guid}.jpg" />
          <meta property="og:url" content="https://hypermemia.link/post/${id}" />
          <meta http-equiv="refresh" content="0; url=https://hypermemia.link/post/${id}" />
        </head>
        <body>Redirecting...</body>
      </html>
              `;
      
              res.writeHead(200, { 'Content-Type': 'text/html' });
              return res.end(html);
      
    } catch (err) {
      console.error(err);
      res.status(500).send('Error processing image');
    }
  });
  
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

})();

