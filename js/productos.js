/** Catálogo local (respaldo si Firestore está vacío o sin conexión) */
export const PRODUCTOS_CATALOGO = [
  { id: "combo", nombre: "Combo", categoria: "combos", descripcion: "Variedad selecta para compartir.", precio: 60, img: "img/Combo.jpeg", badge: { tipo: "promo", texto: "AHORRO" } },
  { id: "roles-canela", nombre: "Roles de Canela", categoria: "pan-dulce", descripcion: "Esponjosos con glaseado y canela premium.", precio: 15, img: "img/Roles de canela.jpeg", badge: { tipo: "popular", texto: "MÁS VENDIDO" } },
  { id: "ojo", nombre: "Ojo", categoria: "pan-dulce", descripcion: "Tradicional pan dulce con textura suave.", precio: 12, img: "img/Ojo.jpeg" },
  { id: "barquillos", nombre: "Barquillos", categoria: "cremas", descripcion: "Hojaldre relleno de crema pastelera.", precio: 17.5, img: "img/Barquillos.jpeg", badge: { tipo: "popular", texto: "FAVORITO" } },
  { id: "nino-envuelto", nombre: "Niño Envuelto", categoria: "pasteles", descripcion: "Bizcocho suave relleno de mermelada.", precio: 18, img: "img/Niño envuelto.jpeg" },
  { id: "volcan-grande", nombre: "Volcán Grande", categoria: "pan-dulce", descripcion: "Relleno de chocolate intenso.", precio: 22, img: "img/Volcán grande.jpeg" },
  { id: "donas-chocolate", nombre: "Donas de Chocolate", categoria: "donas", descripcion: "Cobertura de chocolate real.", precio: 11, img: "img/Donas de chocolate.jpeg", badge: { tipo: "promo", texto: "2X1 MARTES" } },
  { id: "empanadas", nombre: "Empanadas", categoria: "tradicional", descripcion: "Rellenas de cajeta o mermelada.", precio: 20, img: "img/Empanadas.jpeg" },
  { id: "donas-azucar", nombre: "Donas de Azúcar", categoria: "donas", descripcion: "Clásicas y muy esponjosas.", precio: 11, img: "img/Donas de azúcar.jpeg", badge: { tipo: "promo", texto: "2X1 MARTES" } },
  { id: "pelona", nombre: "Pelona", categoria: "tradicional", descripcion: "Pan dulce tradicional mexicano.", precio: 10, img: "img/Pelona.jpeg" },
  { id: "bisquet", nombre: "Bisquet", categoria: "tradicional", descripcion: "Con mantequilla pura, ideal para café.", precio: 15, img: "img/Bisquet.jpeg" },
  { id: "cocada", nombre: "Cocada", categoria: "tradicional", descripcion: "Elaborada con coco fresco.", precio: 13, img: "img/Cocada.jpeg" },
  { id: "gragea", nombre: "Gragea", categoria: "pan-dulce", descripcion: "Decorada con colores festivos.", precio: 12, img: "img/Gragea.jpeg" },
  { id: "pan-pastel", nombre: "Pan de Pastel", categoria: "pasteles", descripcion: "Sabor casero de fiesta.", precio: 19, img: "img/Pan de pastel.jpeg" },
  { id: "chino", nombre: "Chino", categoria: "pan-dulce", descripcion: "Pan dulce característico.", precio: 12, img: "img/Chino.jpeg" },
  { id: "pan-muerto-nutella", nombre: "Pan de muerto con Nutella", categoria: "tradicional", descripcion: "Edición especial con Nutella.", precio: 35, img: "img/Pan de muerto relleno de Nutella.jpeg", badge: { tipo: "especial", texto: "EDICIÓN ESPECIAL" } },
  { id: "budin", nombre: "Budín", categoria: "tradicional", descripcion: "Receta artesanal tradicional.", precio: 14, img: "img/Budín.jpeg" },
  { id: "cuernitos", nombre: "Cuernitos", categoria: "pan-dulce", descripcion: "Hojaldrados y ligeros.", precio: 11, img: "img/Cuernitos.jpeg" },
  { id: "pan-marmoleado", nombre: "Pan de pastel marmoleado", categoria: "pasteles", descripcion: "Vainilla y chocolate en equilibrio.", precio: 18, img: "img/Pan de pastel marmoleado.jpeg" },
  { id: "domino", nombre: "Domino", categoria: "pan-dulce", descripcion: "Pan de dos colores unique.", precio: 12, img: "img/Domino.jpeg" },
  { id: "puritos", nombre: "Puritos", categoria: "pan-dulce", descripcion: "Antojo perfecto para el café.", precio: 10, img: "img/Puritos.jpeg" }
];

export const ETIQUETAS_CATEGORIA = {
  combos: "COMBOS",
  "pan-dulce": "PAN DULCE",
  donas: "DONAS",
  cremas: "CREMAS",
  pasteles: "PASTELES",
  tradicional: "TRADICIONAL"
};
