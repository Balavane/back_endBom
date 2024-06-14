const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3011;

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

// In-memory storage for articles
let articles = [];

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

// Route pour gérer les données d'articles
app.post('/articles', upload.single('articleImage'), (req, res) => {
  const { articleTitle, articleDescription, articleDetails, articleCreationDate } = req.body;
  const articleImage = req.file;

  const newArticle = {
    id: articles.length + 1,
    title: articleTitle,
    description: articleDescription,
    details: articleDetails,
    creationDate: articleCreationDate,
    imagePath: articleImage ? `/uploads/${articleImage.filename}` : null
  };
  
  articles.unshift(newArticle);

  res.status(200).json({ message: 'Données reçues avec succès', article: newArticle });
});

// Route pour récupérer les articles
app.get('/articles', (req, res) => {
  res.status(200).json({ articles });
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
