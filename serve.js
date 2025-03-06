const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const cloudinary = require('cloudinary').v2;

const app = express();


// Configuration de base
app.use(express.json({ limit: '50mb' })); // Augmenter la limite de taille des requêtes JSON
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Augmenter la limite de taille des requêtes URL encodées
app.timeout = 60000; // Délai d'attente de 60 secondes
app.use(cors()); // Activer CORS pour les requêtes cross-origin
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Servir les fichiers statiques du dossier uploads


const port = 3011; // Port sur lequel le serveur écoute
const dbFilePath = path.join(__dirname, 'database.sqlite'); // Chemin de la base de données SQLite
const db = new sqlite3.Database(dbFilePath); // Connexion à la base de données

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: 'dsc9tpg60',
  api_key: '512181693979963',
  api_secret: '1sbfJ9JYMrHZYjnq-M44z71vBnA',
  secure: true,
});

// Création des tables dans la base de données
db.serialize(() => {
  // Créer la table articles si elle n'existe pas
  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    details TEXT,
    creationDate TEXT,
    imageUrl TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    articleId TEXT NOT NULL,
    userId TEXT NOT NULL,
    UNIQUE(articleId, userId)
)`);

  // Vérifier si la colonne imageUrl existe déjà
  db.all(`PRAGMA table_info(articles)`, (error, rows) => {
    if (error) {
      console.error("Erreur lors de la récupération des informations de la table :", error);
    } else {
      const hasImageUrl = rows.some(row => row.name === 'imageUrl');
      if (!hasImageUrl) {
        // Ajouter la colonne imageUrl si elle n'existe pas
        db.run(`ALTER TABLE articles ADD COLUMN imageUrl TEXT`, (error) => {
          if (error) {
            console.error("Erreur lors de l'ajout de la colonne imageUrl :", error);
          } else {
            console.log("Colonne imageUrl ajoutée avec succès.");
          }
        });
      } else {
        console.log("La colonne imageUrl existe déjà.");
      }
    }
  });

  
  
});

// Configuration de Multer pour le téléchargement de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads')); // Dossier de destination des fichiers téléchargés
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Nom du fichier téléchargé
  }
});
const upload = multer({ storage });


// Route de login
const authorizedUser = {
  username: 'sergens',
  password: 'Sergens0110'
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
  const { articleTitle, articleDescription, articleDetails, articleCreationDate } = req.body;
  const articleImage = req.file;

  try {
    let imageUrl = null;
    if (articleImage) {
      // Upload de l'image sur Cloudinary
      const result = await cloudinary.uploader.upload(articleImage.path, {
        folder: '', // Optionnel : spécifiez un dossier dans Cloudinary
      });
      imageUrl = result.secure_url;

      // Supprimer le fichier local après l'upload sur Cloudinary
      fs.unlinkSync(articleImage.path);
    }

    const newArticle = {
      id: Date.now().toString(),
      title: articleTitle,
      description: articleDescription,
      details: articleDetails,
      creationDate: new Date(articleCreationDate).toISOString(),
      imageUrl: imageUrl
    };

    const { id, title, description, details, creationDate, imageUrl: url } = newArticle;

    db.run(`INSERT INTO articles (id, title, description, details, creationDate, imageUrl)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [id, title, description, details, creationDate, url],
            (error) => {
              if (error) {
                console.error(error);
                res.status(500).json({ message: 'Erreur lors de la création de l\'article' });
              } else {
                res.status(200).json({ message: 'Données reçues avec succès', article: newArticle });
              }
            });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur lors de l\'upload de l\'image sur Cloudinary' });
  }
});

// Route pour récupérer les articles
app.get('/articles', (req, res) => {
  db.all(`SELECT * FROM articles ORDER BY creationDate DESC`, (error, rows) => {
    if (error) {
      console.error(error);
      res.status(500).json({ message: 'Erreur lors de la récupération des articles' });
    } else {
      res.status(200).json({ articles: rows });
    }
  });
});

// Route pour modifier un article
app.put('/articles/:id', upload.single('articleImage'), async (req, res) => {
  const { id } = req.params;
  const { title, description, details, creationDate } = req.body;
  const articleImage = req.file;

  try {
    let imageUrl = null;
    if (articleImage) {
      // Upload de la nouvelle image sur Cloudinary
      const result = await cloudinary.uploader.upload(articleImage.path);
      imageUrl = result.secure_url;

      // Supprimer le fichier local après l'upload sur Cloudinary
      fs.unlinkSync(articleImage.path);
    }

    // Mettre à jour l'article dans la base de données
    db.run(
      `UPDATE articles 
       SET title = ?, description = ?, details = ?, creationDate = ?, imageUrl = ?
       WHERE id = ?`,
      [title, description, details, creationDate, imageUrl, id],
      (error) => {
        if (error) {
          console.error(error);
          res.status(500).json({ message: 'Erreur lors de la mise à jour de l\'article' });
        } else {
          res.status(200).json({ message: 'Article mis à jour avec succès' });
        }
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur lors de l\'upload de l\'image sur Cloudinary' });
  }
});

// Route pour supprimer un article
app.delete('/articles/:id', (req, res) => {
  const { id } = req.params;

  db.run(`DELETE FROM articles WHERE id = ?`, [id], (error) => {
    if (error) {
      console.error(error);
      res.status(500).json({ message: 'Erreur lors de la suppression de l\'article' });
    } else {
      res.status(200).json({ message: 'Article supprimé avec succès' });
    }
  });
});


// Démarrer le serveur
app.listen(port, () => {
  console.log(`Serveur backend démarré sur http://localhost:${port}`);
});