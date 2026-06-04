/** Catálogo local (respaldo si Firestore está vacío o sin conexión) */
export const PRODUCTOS_CATALOGO = [
  { id: "roles-canela", nombre: "Roles de Canela", categoria: "pan-dulce", descripcion: "Esponjosos con glaseado y canela premium.", precio: 11, img: "img/Roles de canela.webp", disponible: true, badge: { tipo: "popular", texto: "MÁS VENDIDO" } },
  { id: "barquillos", nombre: "Barquillos", categoria: "cremas", descripcion: "Hojaldre relleno de crema pastelera.", precio: 15, img: "img/Barquillos.webp", disponible: true, badge: { tipo: "popular", texto: "FAVORITO" } },
  { id: "donas-chocolate", nombre: "Donas de Chocolate", categoria: "donas", descripcion: "Cobertura de chocolate real.", precio: 14, img: "img/Donas de chocolate.webp", disponible: true, badge: { tipo: "promo", texto: "2X1 MARTES" } },
  { id: "empanadas", nombre: "Empanadas", categoria: "tradicional", descripcion: "Rellenas de cajeta o mermelada.", precio: 12, img: "img/Empanadas.webp", disponible: true },
  { id: "donas-azucar", nombre: "Donas de Azúcar", categoria: "donas", descripcion: "Clásicas y muy esponjosas.", precio: 11, img: "img/Donas de azúcar.webp", disponible: true, badge: { tipo: "promo", texto: "2X1 MARTES" } },
  { id: "cocada", nombre: "Cocada", categoria: "tradicional", descripcion: "Elaborada con coco fresco.", precio: 10, img: "img/Cocada.webp", disponible: true },
  { id: "pelona", nombre: "Pelona", categoria: "tradicional", descripcion: "Pan dulce tradicional mexicano.", precio: 15, img: "img/Pelona.webp", disponible: true },
  { id: "pan-pastel", nombre: "Pan de Pastel", categoria: "pasteles", descripcion: "Sabor casero de fiesta.", precio: 18, img: "img/Pan de pastel.webp", disponible: true },
  { id: "cuernitos", nombre: "Cuernitos", categoria: "pan-dulce", descripcion: "Hojaldrados y ligeros.", precio: 10, img: "img/Cuernitos.webp", disponible: true },
  { id: "pan-marmoleado", nombre: "Pan de Pastel Marmoleado", categoria: "pasteles", descripcion: "Vainilla y chocolate en equilibrio.", precio: 18, img: "img/Pan de pastel marmoleado.webp", disponible: true },
  { id: "budin", nombre: "Budín", categoria: "tradicional", descripcion: "Receta artesanal tradicional.", precio: 17, img: "img/Budín.webp", disponible: true },
  { id: "domino", nombre: "Domino", categoria: "pan-dulce", descripcion: "Pan de dos colores único.", precio: 14, img: "img/Domino.webp", disponible: true },
  { id: "chino", nombre: "Chino", categoria: "pan-dulce", descripcion: "Pan dulce característico.", precio: 14, img: "img/Chino.webp", disponible: true },
  { id: "puritos", nombre: "Puritos", categoria: "pan-dulce", descripcion: "Antojo perfecto para el café.", precio: 11, img: "img/Puritos.webp", disponible: true },

  { id: "combo", nombre: "Combo", categoria: "combos", descripcion: "Variedad selecta para compartir.", precio: 60, img: "img/Combo.webp", disponible: false, motivoAgotado: "AGOTADO" },
  { id: "ojo", nombre: "Ojo", categoria: "pan-dulce", descripcion: "Tradicional pan dulce con textura suave.", precio: 12, img: "img/Ojo.webp", disponible: false, motivoAgotado: "AGOTADO" },
  { id: "nino-envuelto", nombre: "Niño Envuelto", categoria: "pasteles", descripcion: "Bizcocho suave relleno de mermelada.", precio: 18, img: "img/Niño envuelto.webp", disponible: false, motivoAgotado: "AGOTADO" },
  { id: "volcan-grande", nombre: "Volcán Grande", categoria: "pan-dulce", descripcion: "Relleno de chocolate intenso.", precio: 22, img: "img/Volcán grande.webp", disponible: false, motivoAgotado: "AGOTADO" },
  { id: "bisquet", nombre: "Bisquet", categoria: "tradicional", descripcion: "Con mantequilla pura, ideal para café.", precio: 15, img: "img/Categoría_ Bisquet.webp", disponible: false, motivoAgotado: "AGOTADO" },
  { id: "gragea", nombre: "Gragea", categoria: "pan-dulce", descripcion: "Decorada con colores festivos.", precio: 12, img: "img/Gragea.webp", disponible: false, motivoAgotado: "AGOTADO" },
  { id: "pan-muerto-nutella", nombre: "Pan de muerto con Nutella", categoria: "tradicional", descripcion: "Edición especial con Nutella.", precio: 35, img: "img/Pan de muerto relleno de Nutella.webp", disponible: false, motivoAgotado: "AGOTADO", badge: { tipo: "especial", texto: "TEMPORADA" } }
];

export const ETIQUETAS_CATEGORIA = {
  combos: "COMBOS",
  "pan-dulce": "PAN DULCE",
  donas: "DONAS",
  cremas: "CREMAS",
  pasteles: "PASTELES",
  tradicional: "TRADICIONAL"
};
