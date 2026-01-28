const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises; // Utiliser fs.promises pour les opérations asynchrones
const cloudinary = require('cloudinary').v2;
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp'); // Pour la compression d'images

const app = express();
const prisma = new PrismaClient();

// Configuration de base
app.use(express.json({ limit: '50mb' })); // Augmenter la limite de taille des requêtes JSON
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Augmenter la limite de taille des requêtes URL encodées
app.use(cors()); // Activer CORS pour les requêtes cross-origin
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Servir les fichiers statiques du dossier uploads

const port = 3011; // Port sur lequel le serveur écoute

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: 'dsc9tpg60',
  api_key: '512181693979963',
  api_secret: '1sbfJ9JYMrHZYjnq-M44z71vBnA',
  secure: true,
  timeout: 120000, // Augmenter le délai d'attente à 120 secondes
});

// Configuration de Multer pour le téléchargement de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads')); // Dossier de destination des fichiers téléchargés
  },
  filename: (req, file, cb) => {
    const cleanedFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'); // Nettoyer le nom du fichier
    cb(null, `${Date.now()}-${cleanedFileName}`); // Nom du fichier téléchargé
  },
});
const upload = multer({ storage });

// Route de login
const authorizedUser = {
  username: 'sergens',
  password: 'Sergens0110',
};
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === authorizedUser.username && password === authorizedUser.password) {
    res.status(200).json({ message: 'Authentification réussie' });
  } else {
    res.status(401).json({ message: 'Nom d\'utilisateur ou mot de passe incorrect' });
  }
});

// Route pour ajouter un article
app.post('/articles', upload.single('articleImage'), async (req, res) => {
  const { articleTitle, articleDescription, articleDetails } = req.body;
  const articleImage = req.file;

  console.log('Tentative d\'ajout d\'un nouvel article...');
  console.log('Données reçues:', { articleTitle, articleDescription, articleDetails });

  try {
    let imageUrl = null;
    if (articleImage) {
      console.log('Compression de l\'image...');
      const compressedImagePath = path.join(__dirname, 'uploads', `compressed-${articleImage.filename}`);

      // Redimensionner et compresser l'image avec sharp
      await sharp(articleImage.path)
        .resize(800) // Redimensionner l'image à 800px de large
        .jpeg({ quality: 50 }) // Compresser en JPEG avec une qualité de 50%
        .toFile(compressedImagePath);

      console.log('Téléchargement de l\'image sur Cloudinary...');
      const result = await cloudinary.uploader.upload(compressedImagePath, {
        folder: '', // Optionnel : spécifiez un dossier dans Cloudinary
        timeout: 120000, // Augmenter le délai d'attente à 120 secondes
      });
      console.log('Upload Cloudinary réussi:', result);
      imageUrl = result.secure_url;

      // Supprimer les fichiers locaux après l'upload sur Cloudinary
      try {
        await fs.unlink(articleImage.path);
        console.log('Fichier local supprimé après upload sur Cloudinary.');
      } catch (err) {
        console.error('Erreur lors de la suppression du fichier local:', err);
      }

      try {
        await fs.unlink(compressedImagePath);
        console.log('Fichier compressé supprimé après upload sur Cloudinary.');
      } catch (err) {
        console.error('Erreur lors de la suppression du fichier compressé:', err);
      }
    }

    const newArticle = await prisma.article.create({
      data: {
        title: articleTitle,
        description: articleDescription,
        details: articleDetails,
        imageUrl: imageUrl,
      },
    });

    console.log('Article inséré avec succès:', newArticle);
    res.status(200).json({ message: 'Données reçues avec succès', article: newArticle });
  } catch (error) {
    console.error('Erreur lors de l\'ajout de l\'article:', error);
    res.status(500).json({ message: 'Erreur lors de la création de l\'article' });
  }
});

// Route pour récupérer les articles
app.get('/articles', async (req, res) => {
  console.log('Tentative de récupération des articles...');
  try {
    const articles = await prisma.article.findMany({
      orderBy: {
        creationDate: 'desc',
      },
    });
    console.log('Articles récupérés avec succès:', articles);
    res.status(200).json({ articles });
  } catch (error) {
    console.error('Erreur lors de la récupération des articles:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des articles' });
  }
});

// Route pour modifier un article
app.put('/articles/:id', upload.single('articleImage'), async (req, res) => {
  const { id } = req.params;
  const { title, description, details } = req.body;
  const articleImage = req.file;

  console.log('Tentative de mise à jour de l\'article:', id);

  try {
    let imageUrl = null;
    if (articleImage) {
      console.log('Compression de l\'image...');
      const compressedImagePath = path.join(__dirname, 'uploads', `compressed-${articleImage.filename}`);

      // Redimensionner et compresser l'image avec sharp
      await sharp(articleImage.path)
        .resize(800) // Redimensionner l'image à 800px de large
        .jpeg({ quality: 50 }) // Compresser en JPEG avec une qualité de 50%
        .toFile(compressedImagePath);

      console.log('Téléchargement de la nouvelle image sur Cloudinary...');
      const result = await cloudinary.uploader.upload(compressedImagePath, {
        timeout: 120000, // Augmenter le délai d'attente à 120 secondes
      });
      console.log('Upload Cloudinary réussi:', result);
      imageUrl = result.secure_url;

      // Supprimer les fichiers locaux après l'upload sur Cloudinary
      try {
        await fs.unlink(articleImage.path);
        console.log('Fichier local supprimé après upload sur Cloudinary.');
      } catch (err) {
        console.error('Erreur lors de la suppression du fichier local:', err);
      }

      try {
        await fs.unlink(compressedImagePath);
        console.log('Fichier compressé supprimé après upload sur Cloudinary.');
      } catch (err) {
        console.error('Erreur lors de la suppression du fichier compressé:', err);
      }
    }

    const updatedArticle = await prisma.article.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        details,
        imageUrl,
      },
    });

    console.log('Article mis à jour avec succès:', updatedArticle);
    res.status(200).json({ message: 'Article mis à jour avec succès', article: updatedArticle });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'article:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de l\'article' });
  }
});

// Route pour supprimer un article
app.delete('/articles/:id', async (req, res) => {
  const { id } = req.params;

  console.log('Tentative de suppression de l\'article:', id);

  try {
    const deletedArticle = await prisma.article.delete({
      where: { id: parseInt(id) },
    });
    console.log('Article supprimé avec succès:', deletedArticle);
    res.status(200).json({ message: 'Article supprimé avec succès', article: deletedArticle });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'article:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'article' });
  }
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Serveur backend démarré sur http://localhost:${port}`);
});