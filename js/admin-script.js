// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    query, 
    orderBy,
    where,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Credenciales unificadas del proyecto
const firebaseConfig = {
  apiKey: "AIzaSyCummr4hK95UXm8OoYkSWOBhtDpngpzbwE",
  authDomain: "dulce-aroma-del-buen-hor-8480a.firebaseapp.com",
  databaseURL: "https://dulce-aroma-del-buen-hor-8480a-default-rtdb.firebaseio.com",
  projectId: "dulce-aroma-del-buen-hor-8480a",
  storageBucket: "dulce-aroma-del-buen-hor-8480a.firebasestorage.app",
  messagingSenderId: "397232001248",
  appId: "1:397232001248:web:b60abee05f6ed57af30085"
};

// Inicializar
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Estado global de la vista activa en el administrador
let vistaActiva = "pedidos"; 

// --- CORREO AUTORIZADO COMO ADMINISTRADOR ---
// Reemplaza este correo por el tuyo real con el que harás pruebas
const CORREO_ADMINISTRADOR = "admin@dulcearoma.com"; 

// --- DETECTAR ACCESO Y SEGURIDAD ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        desviarAIndiceConAlerta("¡Acceso Denegado! ❌", "Debes iniciar sesión en la tienda principal antes de intentar ingresar al panel.");
    } else if (user.email !== CORREO_ADMINISTRADOR) {
        desviarAIndiceConAlerta("¡No eres Administrador! 👨‍🍳❌", "Tu cuenta de cliente no cuenta con los permisos necesarios para modificar las comandas.");
    } else {
        // Acceso permitido
        actualizarVistaActivaAdmin();
    }
});

function desviarAIndiceConAlerta(titulo, mensaje) {
    Swal.fire({
        title: titulo,
        text: mensaje,
        icon: 'error',
        confirmButtonColor: '#7a283c'
    }).then(() => {
        window.location.href = "index.html";
    });
}

// --- INTERCAMBIO DE PESTAÑAS ---
function cambiarSeccionAdmin(seccion) {
    vistaActiva = seccion;
    const divPed = document.getElementById("seccionPedidosAdmin");
    const divRes = document.getElementById("seccionReseñasAdmin");
    const tabPed = document.getElementById("tabPedidos");
    const tabRes = document.getElementById("tabReseñas");

    if (seccion === "pedidos") {
        divPed.style.display = "block";
        divRes.style.display = "none";
        tabPed.classList.add("active");
        tabRes.classList.remove("active");
    } else {
        divPed.style.display = "none";
        divRes.style.display = "block";
        tabRes.classList.add("active");
        tabPed.classList.remove("active");
    }
    actualizarVistaActivaAdmin();
}

function actualizarVistaActivaAdmin() {
    if (vistaActiva === "pedidos") {
        cargarPedidosAdmin();
    } else {
        cargarReseñasAdmin();
    }
}

// --- FASE 1: GESTIÓN DE PEDIDOS ---
async function cargarPedidosAdmin() {
    const contenedor = document.getElementById("contenedorPedidosAdmin");
    if (!contenedor) return;

    contenedor.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">🔄 Extrayendo bitácora de comandas...</p>';

    try {
        const q = query(collection(db, "pedidos"), orderBy("fechaCreacion", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            contenedor.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">Aún no se registran comandas de pan de parte de tus clientes en la web.</p>';
            return;
        }

        contenedor.innerHTML = "";

        snapshot.forEach(async (docSnap) => {
            const pedido = docSnap.data();
            const idDoc = docSnap.id;

            const card = document.createElement("div");
            card.className = "card-pedido-admin nuevo-pedido";

            // Listar panes comprados
            let listaProductosHTML = "";
            if (Array.isArray(pedido.productos)) {
                pedido.productos.forEach(prod => {
                    listaProductosHTML += `<li><strong>${prod.cantidad}x</strong> ${prod.nombre}</li>`;
                });
            }

            const fechaCompra = pedido.fechaCreacion ? new Date(pedido.fechaCreacion).toLocaleString() : 'Reciente';
            const estadoActual = pedido.estado || "Recibido 🥖";

            // Buscar si tenemos datos extendidos del cliente
            let telefonoCliente = "Buscando...";
            let direccionCliente = "Recoge en Tienda";

            card.innerHTML = `
                <div class="admin-pedido-meta">
                    <span><strong>Ref:</strong> ${pedido.codigoPedido || '#WEB-XXXX'}</span>
                    <span>${fechaCompra}</span>
                </div>
                <div class="admin-cliente-info">
                    <p><i class="fa-solid fa-user"></i> <strong>Cliente:</strong> ${pedido.cliente}</p>
                    <p><i class="fa-solid fa-map-location-dot"></i> <strong>Dirección:</strong> ${pedido.direccionRecoleccion || 'Recoge en Tienda'}</p>
                </div>
                <ul class="admin-productos-list">
                    ${listaProductosHTML}
                </ul>
                <div class="admin-pedido-entrega">
                    <i class="fa-regular fa-clock"></i> Cita: ${pedido.fechaRecoleccion} | ${pedido.horarioRecoleccion}
                </div>
                <div class="admin-total-row">
                    <span class="admin-total-price">${pedido.total}</span>
                    <select class="selector-estado-pedido" onchange="cambiarEstadoPedidoEnNube('${idDoc}', this.value)">
                        <option value="Recibido 🥖" ${estadoActual === 'Recibido 🥖' ? 'selected' : ''}>Recibido 🥖</option>
                        <option value="En Horno 🔥" ${estadoActual === 'En Horno 🔥' ? 'selected' : ''}>En Horno 🔥</option>
                        <option value="Listo / Entregado ✅" ${estadoActual === 'Listo / Entregado ✅' ? 'selected' : ''}>Listo / Entregado ✅</option>
                    </select>
                </div>
            `;
            contenedor.appendChild(card);
        });

    } catch (err) {
        console.error("Error al traer pedidos al admin: ", err);
        contenedor.innerHTML = '<p class="text-danger" style="grid-column: 1/-1;">Error crítico al consultar Firestore.</p>';
    }
}

async function cambiarEstadoPedidoEnNube(idDoc, nuevoEstado) {
    try {
        const pedidoRef = doc(db, "pedidos", idDoc);
        await updateDoc(pedidoRef, {
            estado: nuevoEstado
        });
        
        // Notificación flotante rápida
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 1500,
            timerProgressBar: true
        });
        Toast.fire({
            icon: 'success',
            title: 'Estado de comanda actualizado'
        });
    } catch(err) {
        console.error("Error al mutar estado del pedido: ", err);
    }
}

// --- FASE 2: MODERACIÓN DE RESEÑAS ---
async function cargarReseñasAdmin() {
    const contenedor = document.getElementById("contenedorReseñasAdmin");
    if (!contenedor) return;

    contenedor.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">🔄 Extrayendo opiniones públicas...</p>';

    try {
        const q = query(collection(db, "reseñas"), orderBy("fecha", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            contenedor.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">No hay opiniones publicadas por clientes en el feed.</p>';
            return;
        }

        contenedor.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const reseña = docSnap.data();
            const idDoc = docSnap.id;

            const card = document.createElement("div");
            card.className = "card-reseña-admin";

            // Dibujar estrellas doradas fijas
            let estrellasHTML = '<div style="color: #f1c40f; font-size: 0.9rem; margin-bottom: 8px;">';
            const numEstrellas = reseña.calificacion || 5;
            for (let i = 1; i <= 5; i++) {
                if (i <= numEstrellas) {
                    estrellasHTML += '<i class="fa-solid fa-star"></i> ';
                } else {
                    estrellasHTML += '<i class="fa-regular fa-star" style="color: #ddd;"></i> ';
                }
            }
            estrellasHTML += ` (${numEstrellas} / 5)</div>`;

            card.innerHTML = `
                <div class="admin-reseña-meta">
                    <span><strong>Autor:</strong> ${reseña.usuario}</span>
                </div>
                ${estrellasHTML}
                <p style="font-size: 0.9rem; color: #333; font-style: italic; margin: 5px 0;">"${reseña.texto}"</p>
                <button class="btn-eliminar-reseña" onclick="eliminarReseñaInapropiada('${idDoc}')">
                    <i class="fa-solid fa-trash-can"></i> ELIMINAR OPINIÓN
                </button>
            `;
            contenedor.appendChild(card);
        });

    } catch (err) {
        console.error("Error al cargar reseñas en admin: ", err);
    }
}

async function eliminarReseñaInapropiada(idDoc) {
    Swal.fire({
        title: '¿Eliminar este comentario? 🗑️',
        text: "Esta opinión desaparecerá permanentemente de la sección pública de testimonios.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#7c726a',
        confirmButtonText: 'Sí, borrar',
        cancelButtonText: 'Mantener'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "reseñas", idDoc));
                Swal.fire(
                    '¡Eliminado! 🔥',
                    'La reseña fue borrada de la base de datos con éxito.',
                    'success'
                );
                cargarReseñasAdmin(); // Recargar el grid
            } catch(err) {
                console.error("Error al borrar opinión: ", err);
            }
        }
    });
}

function regresarAlSitioPublico() {
    window.location.href = "index.html";
}

// --- EXPONER ACCIONES A LA VENTANA GLOBAL ---
window.cambiarSeccionAdmin = cambiarSeccionAdmin;
window.actualizarVistaActivaAdmin = actualizarVistaActivaAdmin;
window.cambiarEstadoPedidoEnNube = cambiarEstadoPedidoEnNube;
window.eliminarReseñaInapropiada = eliminarReseñaInapropiada;
window.regresarAlSitioPublico = regresarAlSitioPublico;
