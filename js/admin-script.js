// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Tus credenciales del proyecto (Mismas que index)
const firebaseConfig = {
  apiKey: "AIzaSyCummr4hK95UXm8OoYkSWOBhtDpngpzbwE",
  authDomain: "dulce-aroma-del-buen-hor-8480a.firebaseapp.com",
  databaseURL: "https://dulce-aroma-del-buen-hor-8480a-default-rtdb.firebaseio.com",
  projectId: "dulce-aroma-del-buen-hor-8480a",
  storageBucket: "dulce-aroma-del-buen-hor-8480a.firebasestorage.app",
  messagingSenderId: "397232001248",
  appId: "1:397232001248:web:b60abee05f6ed57af30085"
};

// Inicializar Firebase en Administración
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- FUNCIÓN DE LECTURA DE PEDIDOS TOTALES ---
async function cargarPedidosAdmin() {
    const contenedor = document.getElementById('contenedorPedidosAdmin');
    if (!contenedor) return;

    contenedor.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">🔄 Sincronizando con Firestore en tiempo real...</p>';

    try {
        // Consultamos la colección 'pedidos' ordenando de los más nuevos a los más antiguos
        const q = query(collection(db, "pedidos"), orderBy("fechaCreacion", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            contenedor.innerHTML = '<p class="text-muted" style="grid-column: 1/-1;">🥖 No hay ningún pedido registrado todavía en la plataforma.</p>';
            return;
        }

        contenedor.innerHTML = ""; // Limpiar mensaje de carga

        querySnapshot.forEach((doc) => {
            const pedido = doc.data();
            const card = document.createElement('div');
            card.className = 'card-pedido-admin nuevo-pedido';

            // Convertir timestamp a formato legible
            const horaPedido = pedido.fechaCreacion ? new Date(pedido.fechaCreacion).toLocaleString() : 'No especificada';

            // Formatear los productos de la compra
            let listadoProductos = "";
            if (Array.isArray(pedido.productos)) {
                pedido.productos.forEach(p => {
                    listadoProductos += `<li><strong>${p.cantidad}x</strong> ${p.nombre} - <span style="color:#7a283c;">$${(p.precio * p.cantidad).toFixed(2)}</span></li>`;
                });
            }

            card.innerHTML = `
                <div>
                    <div class="admin-pedido-meta">
                        <span style="font-weight: bold; color: var(--guinda);">Ref: ${pedido.codigoPedido || '#WEB-XXXX'}</span>
                        <span>⏱️ ${horaPedido}</span>
                    </div>

                    <div class="admin-cliente-info">
                        <p><strong><i class="fa-solid fa-user"></i> Cliente:</strong> ${pedido.cliente || 'Invitado'}</p>
                        <p style="font-size:0.8rem; color:#555;"><i class="fa-solid fa-id-badge"></i> ID: ${pedido.uidCliente || 'N/A'}</p>
                    </div>

                    <h4 style="margin: 10px 0 5px 0; font-size: 0.9rem; color: var(--texto-oscuro);">🥖 Panes solicitados:</h4>
                    <ul class="admin-productos-list">
                        ${listadoProductos}
                    </ul>

                    <div class="admin-pedido-entrega">
                        <p style="margin: 2px 0;"><strong>📅 Fecha de recogida:</strong> ${pedido.fechaRecoleccion || 'No definida'}</p>
                        <p style="margin: 2px 0;"><strong>🕒 Horario estimado:</strong> ${pedido.horarioRecoleccion || 'No definido'}</p>
                    </div>
                </div>

                <div class="admin-total-row">
                    <span class="badge-atendido">Recibido en Tienda ✔️</span>
                    <span class="admin-total-price">${pedido.total}</span>
                </div>
            `;

            contenedor.appendChild(card);
        });

    } catch (error) {
        console.error("Error al leer pedidos de la administración: ", error);
        contenedor.innerHTML = '<p class="text-danger" style="grid-column: 1/-1;">Fallo en la conexión. Asegúrate de tener permisos o haber configurado las reglas en Firestore.</p>';
    }
}

// Ejecutar automáticamente al entrar a la página
window.onload = () => {
    cargarPedidosAdmin();
};

// Exponer la función al botón manual
window.cargarPedidosAdmin = cargarPedidosAdmin;
