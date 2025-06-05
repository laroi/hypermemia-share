import http from 'http';
import { MongoClient, ObjectId } from 'mongodb';

(async () => {
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

  const server = http.createServer(async (req, res) => {
    const match = req.url.match(/^\/post\/([a-f0-9]{24})\/share$/i);
    if (match) {
      const postId = match[1];
      try {
        const post = await posts.findOne({ _id: new ObjectId(postId) });
        if (!post) {
          res.writeHead(404);
          return res.end('Post not found');
        }

        const title = post.title || `Post ${postId}`;
        const image = `https://hypermemia.link/api${post.image.thumb}`;
        const movie = post.movie
        const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>${title} - ${movie} plain meme</title>
    <meta property="og:title" content="${title} - ${movie} plain meme" />
    <meta property="og:image" content="${image}" />
    <meta property="og:url" content="https://hypermemia.link/post/${postId}" />
    <meta http-equiv="refresh" content="0; url=/post/${postId}" />
  </head>
  <body>Redirecting...</body>
</html>
        `;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(html);
      } catch (e) {
        console.error(e);
        res.writeHead(500);
        return res.end('Internal server error');
      }
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(4006, () => {
    console.log('OG meta server running at http://localhost:4006');
  });
})();
