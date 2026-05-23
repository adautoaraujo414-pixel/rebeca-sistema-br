FROM node:18-alpine
WORKDIR /app

# Instalar dependencias do backend
COPY package*.json ./
RUN npm install --production

# Build do frontend React (Rebeca Soft)
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install && npm run build

# Copiar todo o codigo
COPY . .

EXPOSE 10000
CMD ["node", "src/index.js"]
