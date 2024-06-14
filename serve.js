const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const app = express();
const port = 3011;

// Middleware pour gérer les téléchargements de fichiers avec Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// Middleware pour parser le corps de la requête
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware pour activer CORS
app.use(cors());

// Middleware pour servir les fichiers statiques (images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Stockage en mémoire pour les articles
let articles = [];

// Endpoint POST pour recevoir les données du formulaire
app.post('/articles', upload.single('articleImage'), (req, res) => {
  const { articleTitle, articleDescription, articleDetails } = req.body;
  const articleImage = req.file; // Information sur l'image téléchargée

  // Créez un nouvel article
  const newArticle = {
    id: articles.length + 1,
    title: articleTitle,
    description: articleDescription,
    details: articleDetails,
    imagePath: articleImage ? `/uploads/${articleImage.filename}` : null
  };

  // Ajoutez l'article au tableau en mémoire
  articles.push(newArticle);

  // Réponse au client
  res.status(200).json({ message: 'Données reçues avec succès', article: newArticle });
});

// Endpoint GET pour récupérer les articles
app.get('/articles', (req, res) => {
  // Réponse avec la liste des articles
  res.status(200).json({ articles });
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Serveur backend démarré sur http://localhost:${port}`);
});
