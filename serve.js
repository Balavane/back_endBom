const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const cloudinary = require('cloudinary').v2;

const app = express();
const port = 3011;
const dbFilePath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFilePath);

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: 'dsc9tpg60',
  api_key: '512181693979963',
  api_secret: '1sbfJ9JYMrHZYjnq-M44z71vBnA',
  secure: true,
});

// Création de la table articles si elle n'existe pas
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    details TEXT,
    creationDate TEXT,
    imageUrl TEXT
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

  // (Optionnel) Supprimer l'ancienne colonne imagePath si elle existe
  db.all(`PRAGMA table_info(articles)`, (error, rows) => {
    if (error) {
      console.error("Erreur lors de la récupération des informations de la table :", error);
    } else {
      const hasImagePath = rows.some(row => row.name === 'imagePath');
      if (hasImagePath) {
        console.log("La colonne imagePath existe. Création d'une nouvelle table sans imagePath...");

        // Créer une nouvelle table temporaire
        db.run(`CREATE TABLE IF NOT EXISTS articles_temp (
          id TEXT PRIMARY KEY,
          title TEXT,
          description TEXT,
          details TEXT,
          creationDate TEXT,
          imageUrl TEXT
        )`, (error) => {
          if (error) {
            console.error("Erreur lors de la création de la table temporaire :", error);
          } else {
            // Copier les données de l'ancienne table vers la nouvelle
            db.run(`INSERT INTO articles_temp (id, title, description, details, creationDate, imageUrl)
                    SELECT id, title, description, details, creationDate, NULL FROM articles`, (error) => {
              if (error) {
                console.error("Erreur lors de la copie des données :", error);
              } else {
                // Supprimer l'ancienne table
                db.run(`DROP TABLE articles`, (error) => {
                  if (error) {
                    console.error("Erreur lors de la suppression de l'ancienne table :", error);
                  } else {
                    // Renommer la nouvelle table en articles
                    db.run(`ALTER TABLE articles_temp RENAME TO articles`, (error) => {
                      if (error) {
                        console.error("Erreur lors du renommage de la table :", error);
                      } else {
                        console.log("Colonne imagePath supprimée avec succès.");
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    }
  });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Définir l'utilisateur autorisé
const authorizedUser = {
  username: 'sergens',
  password: 'Sergens0110'
};

// Route de login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === authorizedUser.username && password === authorizedUser.password) {
    // Authentification réussie
    res.status(200).json({ message: 'Authentification réussie' });
  } else {
    // Authentification échouée
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

// Route protégée (exemple)
app.get('/paramettre', authenticateUser, (req, res) => {
  res.send('Page paramettre - Accès autorisé uniquement pour l\'utilisateur authentifié.');
});

// Fonction middleware pour l'authentification
function authenticateUser(req, res, next) {
  // Vérifier ici l'authentification de l'utilisateur
  // Exemple basique : si l'utilisateur est authentifié, appeler next(), sinon renvoyer une erreur
  if (req.isAuthenticated()) {
    return next();
  } else {
    return res.status(401).json({ message: 'Non authentifié' });
  }
}

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Serveur backend démarré sur http://localhost:${port}`);
});