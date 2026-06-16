# ── 1. Build aşaması ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Bağımlılıkları önce kopyala (layer cache için)
COPY package*.json ./
RUN npm install --ignore-scripts

# Kaynak kodunu kopyala
COPY . .

# Vite VITE_ env değişkenlerini build anında argüman olarak alıyoruz
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_MISTRAL_API_KEY
ARG VITE_R2_UPLOAD_URL
ARG VITE_R2_PUBLIC_BASE_URL
ARG VITE_R2_UPLOAD_SECRET

ENV VITE_R2_UPLOAD_URL=$VITE_R2_UPLOAD_URL
ENV VITE_R2_PUBLIC_BASE_URL=$VITE_R2_PUBLIC_BASE_URL
ENV VITE_R2_UPLOAD_SECRET=$VITE_R2_UPLOAD_SECRET
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_MISTRAL_API_KEY=$VITE_MISTRAL_API_KEY

RUN npx vite build

# ── 2. Servis aşaması (nginx) ──────────────────────────────────
FROM nginx:stable-alpine AS runner

# Cloud Run port 8080 kullanır
EXPOSE 8080

# nginx konfigürasyonu
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Build çıktısını nginx'e kopyala
COPY --from=builder /app/dist /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
