# Utiliser l'image officielle Node.js légère
FROM node:18-alpine

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances (y compris les dépendances de développement pour compiler)
RUN npm ci

# Copier tout le code du backend
COPY . .

# Compiler le projet NestJS en JavaScript de production
RUN npm run build

# Supprimer les dépendances de dev et réinstaller uniquement celles de production pour alléger le conteneur
RUN npm prune --production

# Hugging Face Spaces nécessite d'exposer le port 7860
EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production

# Hugging Face Spaces tourne avec un utilisateur non-root aléatoire (UID 1000)
# Assurer les droits d'écriture sur le cache npm et le répertoire /app
RUN mkdir -p /.npm && chmod -R 777 /.npm /app

# Lancer l'application NestJS compilée
CMD ["node", "dist/main.js"]
