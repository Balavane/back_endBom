require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;
const cloudinary = require('cloudinary').v2;
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const nodemailer = require('nodemailer');

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Configuration Cloudinary
cloudinary.config({
  cloud_name: 'dsc9tpg60',
  api_key: '512181693979963',
  api_secret: '1sbfJ9JYMrHZYjnq-M44z71vBnA',
  secure: true,
  timeout: 120000,
});

// Création du dossier uploads s'il n'existe pas
const createUploadsFolder = async () => {
  try {
    await fs.access(path.join(__dirname, 'uploads'));
  } catch {
    await fs.mkdir(path.join(__dirname, 'uploads'));
  }
};
createUploadsFolder();

// Configuration Multer avec validation
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non supporté'), false);
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const cleanedFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${Date.now()}-${cleanedFileName}`);
  },
});

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Login simple
const authorizedUser = {
  username: 'sergens',
  password: 'Sergens0110',
};

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === authorizedUser.username && password === authorizedUser.password) {
    return res.status(200).json({ message: 'Authentification réussie' });
  }
  return res.status(401).json({ message: 'Nom d\'utilisateur ou mot de passe incorrect' });
});

// Ajouter un article
app.post('/articles', upload.single('articleImage'), async (req, res) => {
  const { articleTitle, articleDescription, articleDetails } = req.body;
  const articleImage = req.file;

  // Validation des entrées
  if (!articleTitle || !articleDescription) {
    return res.status(400).json({ message: 'Le titre et la description sont obligatoires' });
  }

  try {
    let imageUrl = null;
    if (articleImage) {
      try {
        await fs.access(articleImage.path);
      } catch {
        return res.status(400).json({ message: 'Le fichier image est introuvable' });
      }

      const compressedImagePath = path.join(__dirname, 'uploads', `compressed-${articleImage.filename}`);
      
      // Compression de l'image
      await sharp(articleImage.path)
        .resize(800)
        .jpeg({ quality: 50 })
        .toFile(compressedImagePath);

      // Upload vers Cloudinary
      const result = await cloudinary.uploader.upload(compressedImagePath, {
        timeout: 120000,
      });
      imageUrl = result.secure_url;

      // Nettoyage des fichiers temporaires
      try {
        await fs.unlink(articleImage.path);
        await fs.unlink(compressedImagePath);
      } catch (unlinkError) {
        console.error('Erreur lors de la suppression des fichiers:', unlinkError);
      }
    }

    const newArticle = await prisma.article.create({
      data: {
        title: articleTitle,
        description: articleDescription,
        details: articleDetails,
        imageUrl,
      },
    });

    return res.status(201).json({ message: 'Article créé avec succès', article: newArticle });
  } catch (error) {
    console.error('Erreur lors de la création de l\'article:', error);
    return res.status(500).json({ message: 'Erreur lors de la création de l\'article' });
  }
});

// Récupérer les articles
app.get('/articles', async (req, res) => {
  try {
    const articles = await prisma.article.findMany({
      orderBy: { creationDate: 'desc' },
    });
    return res.status(200).json({ articles });
  } catch (error) {
    console.error('Erreur lors de la récupération des articles:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des articles' });
  }
});

// Modifier un article
app.put('/articles/:id', upload.single('articleImage'), async (req, res) => {
  const { id } = req.params;
  const { title, description, details } = req.body;
  const articleImage = req.file;

  if (!title || !description) {
    return res.status(400).json({ message: 'Le titre et la description sont obligatoires' });
  }

  try {
    let imageUrl = null;
    if (articleImage) {
      try {
        await fs.access(articleImage.path);
      } catch {
        return res.status(400).json({ message: 'Le fichier image est introuvable' });
      }

      const compressedImagePath = path.join(__dirname, 'uploads', `compressed-${articleImage.filename}`);
      
      await sharp(articleImage.path)
        .resize(800)
        .jpeg({ quality: 50 })
        .toFile(compressedImagePath);

      const result = await cloudinary.uploader.upload(compressedImagePath, {
        timeout: 120000,
      });
      imageUrl = result.secure_url;

      try {
        await fs.unlink(articleImage.path);
        await fs.unlink(compressedImagePath);
      } catch (unlinkError) {
        console.error('Erreur lors de la suppression des fichiers:', unlinkError);
      }
    }

    const updatedArticle = await prisma.article.update({
      where: { id: parseInt(id) },
      data: { 
        title, 
        description, 
        details, 
        ...(imageUrl && { imageUrl }) // Ne met à jour imageUrl que si une nouvelle image est fournie
      },
    });

    return res.status(200).json({ message: 'Article mis à jour avec succès', article: updatedArticle });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'article:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour de l\'article' });
  }
});

// Supprimer un article
app.delete('/articles/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deletedArticle = await prisma.article.delete({
      where: { id: parseInt(id) },
    });
    return res.status(200).json({ message: 'Article supprimé avec succès', article: deletedArticle });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'article:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression de l\'article' });
  }
});

// Middleware de gestion d'erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: 'Erreur de téléchargement de fichier' });
  }
  res.status(500).json({ message: 'Une erreur est survenue' });
});
// Liker un article
app.post('/articles/:id/like', async (req, res) => {
  const articleId = parseInt(req.params.id);
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'Le champ userId est requis' });
  }

  try {
    // Vérifier si le like existe déjà
    const existingLike = await prisma.like.findUnique({
      where: {
        articleId_userId: {
          articleId,
          userId,
        },
      },
    });

    if (existingLike) {
      return res.status(400).json({ message: 'Vous avez déjà liké cet article' });
    }

    // Créer un nouveau like
    const like = await prisma.like.create({
      data: {
        articleId,
        userId,
      },
    });

    return res.status(201).json({ message: 'Article liké avec succès', like });
  } catch (error) {
    console.error('Erreur lors du like de l\'article :', error);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});
// integration d'un systeme de paiement
app.post('/envoyer-don-mail', async (req, res) => {
  const { email, montant, devise, nom, postNom } = req.body;

  if (!email || !montant || !devise || !nom || !postNom) {
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const htmlContent = `
    <p>Bonjour <strong>${nom} ${postNom}</strong>,</p>
    <p>Nous avons bien reçu votre intention de faire un don de <strong>${montant} ${devise}</strong>. 🙏</p>
    <p>Voici nos options de paiement :</p>

    <ul>
      <li>📱 Airtel Money : <strong>+243 97 751 4327</strong></li>
    </ul>

    <p>🏦 Compte bancaire :</p>
    <ul>
      <li>Banque : Accèss Bank</li>
      <li>Numéro de compte : 30008257601</li>
      <li>IBAN : CD000123456789000</li>
      <li>SWIFT/BIC : BDESCDKI</li>
    </ul>

    <p>Merci de nous envoyer une preuve de paiement à <a href="mailto:negrefilmafrika@gmail.com">negrefilmafrika@gmail.com</a>.</p>
    <p>Votre geste compte énormément. Merci du fond du cœur ❤️</p>
  `;

  const notificationToDaniel = `
    <p><strong>${nom} ${postNom}</strong> (<strong>${email}</strong>) est en train de faire un don de <strong>${montant} ${devise}</strong>.</p>
    <p>Veuillez vérifier et suivre si nécessaire.</p>
  `;

  try {
    await transporter.sendMail({
      from: `"Afrika negre" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Confirmation de votre don',
      html: htmlContent,
    });

    await transporter.sendMail({
      from: `"Afrika negre" <${process.env.EMAIL_USER}>`,
      to: `<${process.env.EMAIL_USER}>`,
      subject: 'Un donnateur prépare un don',
      html: notificationToDaniel,
    });

    res.status(200).json({ message: 'E-mails envoyés avec succès' });
  } catch (error) {
    console.error('Erreur lors de l’envoi des mails :', error);
    res.status(500).json({ message: 'Échec de l’envoi des mails' });
  }
});



// Démarrer le serveur
const port = process.env.PORT || 3011;
app.listen(port, () => {
  console.log(`✅ Serveur backend démarré sur http://localhost:${port}`);
});