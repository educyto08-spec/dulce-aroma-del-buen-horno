import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let vistaActiva = "pedidos";
const ADMIN_EMAILS_RESPALDO = ["educyto08@gmail.com"];

function escapeHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

async function obtenerEmailsAdmin() {
    try {
        const snap = await getDoc(doc(db, "config", "admin"));
        if (snap.exists() && Array.isArray(snap.data().emails) && snap.data().emails.length > 0) {
            return snap.data().emails;
        }
    } catch (e) {
        console.warn("No se pudo leer config/admin, usando lista local.", e);
    }
    return ADMIN_EMAILS_RESPALDO;
}

async function esUsuarioAdmin(email) {
    if (!email) return false;
    const lista = await obtenerEmailsAdmin();
    return lista.includes(email);
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        desviarAIndiceConAlerta("¡Acceso Denegado! ❌", "Debes iniciar sesión en la tienda principal antes de ingresar al panel.");
        return;
    }
    const permitido = await esUsuarioAdmin(user.email);
    if (!permitido) {
        desviarAIndiceConAlerta("¡No eres Administrador! 👨‍🍳❌", "Tu cuenta no tiene permisos para este panel.");
        return;
    }
    actualizarVistaActivaAdmin();
});

function desviarAIndiceConAlerta(titulo, mensaje) {
    Swal.fire({ title: titulo, text: mensaje, icon: "error", confirmButtonColor: "#7b5533" }).then(() => {
        window.location.href = "index.html";
    });
}

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
    if (vistaActiva === "pedidos") cargarPedidosAdmin();
    else cargarReseñasAdmin();
}

async function cargarPedidosAdmin() {
    const contenedor = document.getElementById("contenedorPedidosAdmin");
    if (!contenedor) return;

    contenedor.innerHTML = '<p class="text-muted admin-msg-full">🔄 Extrayendo comandas...</p>';

    try {
        const q = query(collection(db, "pedidos"), orderBy("fechaCreacion", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            contenedor.innerHTML = '<p class="text-muted admin-msg-full">Aún no hay comandas registradas.</p>';
            return;
        }

        contenedor.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const pedido = docSnap.data();
            const idDoc = docSnap.id;
            let listaProductosHTML = "";
            if (Array.isArray(pedido.productos)) {
                pedido.productos.forEach((prod) => {
                    listaProductosHTML += `<li><strong>${prod.cantidad}x</strong> ${escapeHtml(prod.nombre)}</li>`;
                });
            }

            const fechaCompra = pedido.fechaCreacion ? new Date(pedido.fechaCreacion).toLocaleString() : "Reciente";
            const estadoActual = pedido.estado || "Recibido 🥖";

            const card = document.createElement("div");
            card.className = "card-pedido-admin nuevo-pedido";
            card.innerHTML = `
                <div class="admin-pedido-meta">
                    <span><strong>Ref:</strong> ${escapeHtml(pedido.codigoPedido || "#WEB-XXXX")}</span>
                    <span>${fechaCompra}</span>
                </div>
                <div class="admin-cliente-info">
                    <p><i class="fa-solid fa-user" aria-hidden="true"></i> <strong>Cliente:</strong> ${escapeHtml(pedido.cliente)}</p>
                    <p><i class="fa-solid fa-box" aria-hidden="true"></i> <strong>Entrega:</strong> ${escapeHtml(pedido.metodoEntrega || "Recoger en tienda")}</p>
                    <p><i class="fa-solid fa-location-dot" aria-hidden="true"></i> <strong>Dirección:</strong> ${escapeHtml(pedido.direccionEntrega || pedido.direccionRecoleccion || "—")}</p>
                </div>
                <ul class="admin-productos-list">${listaProductosHTML}</ul>
                <div class="admin-pedido-entrega">
                    <i class="fa-regular fa-clock" aria-hidden="true"></i> Cita: ${escapeHtml(pedido.fechaRecoleccion)} | ${escapeHtml(pedido.horarioRecoleccion)}
                </div>
                <div class="admin-total-row">
                    <span class="admin-total-price">${escapeHtml(String(pedido.total))}</span>
                    <select class="selector-estado-pedido" data-pedido-id="${idDoc}" aria-label="Estado del pedido">
                        <option value="Recibido 🥖" ${estadoActual === "Recibido 🥖" ? "selected" : ""}>Recibido 🥖</option>
                        <option value="En Horno 🔥" ${estadoActual === "En Horno 🔥" ? "selected" : ""}>En Horno 🔥</option>
                        <option value="Listo / Entregado ✅" ${estadoActual === "Listo / Entregado ✅" ? "selected" : ""}>Listo / Entregado ✅</option>
                    </select>
                </div>
            `;
            card.querySelector(".selector-estado-pedido").addEventListener("change", (e) => {
                cambiarEstadoPedidoEnNube(idDoc, e.target.value);
            });
            contenedor.appendChild(card);
        });
    } catch (err) {
        console.error(err);
        contenedor.innerHTML = '<p class="text-danger admin-msg-full">Error al consultar Firestore. Verifica las reglas de seguridad.</p>';
    }
}

async function cambiarEstadoPedidoEnNube(idDoc, nuevoEstado) {
    try {
        await updateDoc(doc(db, "pedidos", idDoc), { estado: nuevoEstado });
        Swal.mixin({ toast: true, position: "top-end", showConfirmButton: false, timer: 1500 }).fire({
            icon: "success", title: "Estado actualizado"
        });
    } catch (err) {
        console.error(err);
        Swal.fire("Error", "No se pudo actualizar el estado.", "error");
    }
}

async function cargarReseñasAdmin() {
    const contenedor = document.getElementById("contenedorReseñasAdmin");
    if (!contenedor) return;

    contenedor.innerHTML = '<p class="text-muted admin-msg-full">🔄 Cargando opiniones...</p>';

    try {
        const q = query(collection(db, "resenas"), orderBy("fecha", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            contenedor.innerHTML = '<p class="text-muted admin-msg-full">No hay opiniones publicadas.</p>';
            return;
        }

        contenedor.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const reseña = docSnap.data();
            const idDoc = docSnap.id;
            const numEstrellas = reseña.calificacion || 5;
            let estrellasHTML = '<div class="admin-stars">';
            for (let i = 1; i <= 5; i++) {
                estrellasHTML += i <= numEstrellas
                    ? '<i class="fa-solid fa-star" aria-hidden="true"></i> '
                    : '<i class="fa-regular fa-star admin-star-empty" aria-hidden="true"></i> ';
            }
            estrellasHTML += ` (${numEstrellas}/5)</div>`;

            const card = document.createElement("div");
            card.className = "card-reseña-admin";
            card.innerHTML = `
                <div class="admin-reseña-meta"><span><strong>Autor:</strong> ${escapeHtml(reseña.usuario)}</span></div>
                ${estrellasHTML}
                <p class="admin-reseña-texto">"${escapeHtml(reseña.texto)}"</p>
                <button type="button" class="btn-eliminar-reseña" data-reseña-id="${idDoc}">
                    <i class="fa-solid fa-trash-can" aria-hidden="true"></i> ELIMINAR OPINIÓN
                </button>
            `;
            card.querySelector(".btn-eliminar-reseña").addEventListener("click", () => eliminarReseñaInapropiada(idDoc));
            contenedor.appendChild(card);
        });
    } catch (err) {
        console.error(err);
    }
}

async function eliminarReseñaInapropiada(idDoc) {
    const result = await Swal.fire({
        title: "¿Eliminar este comentario? 🗑️",
        text: "Desaparecerá permanentemente del sitio público.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#e74c3c",
        cancelButtonColor: "#7c726a",
        confirmButtonText: "Sí, borrar",
        cancelButtonText: "Mantener"
    });
    if (!result.isConfirmed) return;
    try {
        await deleteDoc(doc(db, "resenas", idDoc));
        Swal.fire("¡Eliminado! 🔥", "La reseña fue borrada.", "success");
        cargarReseñasAdmin();
    } catch (err) {
        console.error(err);
    }
}

function regresarAlSitioPublico() {
    window.location.href = "index.html";
}

Object.assign(window, {
    cambiarSeccionAdmin, actualizarVistaActivaAdmin, cambiarEstadoPedidoEnNube,
    eliminarReseñaInapropiada, regresarAlSitioPublico
});
