import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
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
    document.querySelectorAll(".seccion").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

    if (seccion === "pedidos") {
        document.getElementById("seccionPedidos").classList.add("active");
        document.querySelector(".nav-item:nth-child(1)").classList.add("active");
        document.getElementById("topbarTitle").textContent = "Pedidos recibidos";
        document.getElementById("topbarSub").textContent   = "Gestiona y actualiza el estado de cada comanda";
    } else {
        document.getElementById("seccionResenas").classList.add("active");
        document.querySelector(".nav-item:nth-child(2)").classList.add("active");
        document.getElementById("topbarTitle").textContent = "Opiniones de clientes";
        document.getElementById("topbarSub").textContent   = "Modera las reseñas publicadas en la tienda";
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
    contenedor.innerHTML = `<div class="empty-state"><i class="fa-solid fa-rotate fa-spin"></i><p>Extrayendo comandas...</p></div>`;

    try {
        const q = query(collection(db, "pedidos"), orderBy("fechaCreacion", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            contenedor.innerHTML = `<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Aún no hay comandas registradas.</p></div>`;
            return;
        }

        // KPIs
        const todos = snapshot.docs.map(d => ({ _id: d.id, ...d.data() }));
        const hoy = new Date(); hoy.setHours(0,0,0,0);
        document.getElementById("kpiPedidosHoy").textContent = todos.filter(p => new Date(p.fechaCreacion) >= hoy).length;
        document.getElementById("kpiEnProceso").textContent  = todos.filter(p => !p.estado?.includes("Listo") && !p.estado?.includes("Entregado")).length;
        document.getElementById("kpiEntregados").textContent = todos.filter(p => p.estado?.includes("Listo") || p.estado?.includes("Entregado")).length;
        const total = todos.reduce((s, p) => s + (parseFloat(String(p.total).replace(/[^0-9.]/g, "")) || 0), 0);
        document.getElementById("kpiVentaTotal").textContent = "$" + total.toFixed(0);
        document.getElementById("badgePedidos").textContent  = todos.length;

        contenedor.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const pedido = docSnap.data();
            const idDoc  = docSnap.id;
            const estadoActual = pedido.estado || "Recibido 🥖";
            const esDom = (pedido.metodoEntrega || "").toLowerCase().includes("domicilio");
            const fechaCompra = pedido.fechaCreacion ? new Date(pedido.fechaCreacion).toLocaleString() : "Reciente";

            let productosHTML = "";
            if (Array.isArray(pedido.productos)) {
                pedido.productos.forEach(pr => {
                    productosHTML += `<li><span>${pr.cantidad}× ${escapeHtml(pr.nombre)}</span><span>$${(pr.precio * pr.cantidad).toFixed(2)}</span></li>`;
                });
            }

            let dotClass = "dot-recibido";
            if (estadoActual.includes("Horno")) dotClass = "dot-horno";
            else if (estadoActual.includes("Listo") || estadoActual.includes("Entregado")) dotClass = "dot-listo";

            const ini = (pedido.cliente || "?").trim().split(" ").slice(0,2).map(w => w[0]?.toUpperCase() || "").join("");

            const card = document.createElement("div");
            card.className = "card-pedido";
            card.id = "card-" + idDoc;
            card.innerHTML = `
                <div class="card-pedido-top">
                    <span class="pedido-estado-dot ${dotClass}"></span>
                    <span class="pedido-codigo">${escapeHtml(pedido.codigoPedido || "#WEB-XXXX")}</span>
                    <span class="pedido-fecha">${fechaCompra}</span>
                </div>
                <div class="card-pedido-body">
                    <div class="pedido-cliente-row">
                        <div class="avatar-circle">${ini}</div>
                        <div>
                            <div class="pedido-cliente-nombre">${escapeHtml(pedido.cliente || "Cliente")}</div>
                            <div class="pedido-cliente-meta">📅 ${escapeHtml(pedido.fechaRecoleccion || "—")} · ${escapeHtml(pedido.horarioRecoleccion || "—")}</div>
                        </div>
                    </div>
                    <ul class="pedido-productos-lista">${productosHTML}</ul>
                    <div class="pedido-entrega-badge ${esDom ? 'entrega-domicilio' : 'entrega-tienda'}">
                        <i class="fa-solid ${esDom ? 'fa-motorcycle' : 'fa-store'}"></i>
                        <div>
                            <div>${escapeHtml(pedido.metodoEntrega || "Recoger en tienda")}</div>
                            ${esDom && pedido.direccionEntrega ? `<div class="pedido-dir">${escapeHtml(pedido.direccionEntrega)}</div>` : ""}
                        </div>
                    </div>
                </div>
                <div class="card-pedido-footer">
                    <div class="pedido-total">
                        <span>Total</span>${escapeHtml(String(pedido.total))}
                    </div>
                    <select class="select-estado" aria-label="Estado del pedido">
                        <option ${estadoActual === "Recibido 🥖"           ? "selected" : ""}>Recibido 🥖</option>
                        <option ${estadoActual === "En el horno 🔥"        ? "selected" : ""}>En el horno 🔥</option>
                        <option ${estadoActual === "Listo para recoger ✅" ? "selected" : ""}>Listo para recoger ✅</option>
                        <option ${estadoActual === "En camino 🏍️"          ? "selected" : ""}>En camino 🏍️</option>
                        <option ${estadoActual === "Entregado 🎉"          ? "selected" : ""}>Entregado 🎉</option>
                    </select>
                </div>
            `;
            card.querySelector(".select-estado").addEventListener("change", (e) => {
                cambiarEstadoPedidoEnNube(idDoc, e.target.value, card);
            });
            contenedor.appendChild(card);
        });
    } catch (err) {
        console.error(err);
        contenedor.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Error al consultar Firestore.</p></div>`;
    }
}

async function cambiarEstadoPedidoEnNube(idDoc, nuevoEstado, card) {
    try {
        await updateDoc(doc(db, "pedidos", idDoc), { estado: nuevoEstado });
        if (card) {
            const dot = card.querySelector(".pedido-estado-dot");
            dot.className = "pedido-estado-dot " + (
                nuevoEstado.includes("Horno")    ? "dot-horno"  :
                nuevoEstado.includes("Listo") || nuevoEstado.includes("Entregado") ? "dot-listo" :
                "dot-recibido"
            );
        }
        Swal.mixin({ toast: true, position: "top-end", showConfirmButton: false, timer: 1500 })
            .fire({ icon: "success", title: "Estado actualizado" });
    } catch (err) {
        console.error(err);
        Swal.fire("Error", "No se pudo actualizar el estado.", "error");
    }
}

async function cargarReseñasAdmin() {
    const contenedor = document.getElementById("contenedorReseñasAdmin");
    if (!contenedor) return;
    contenedor.innerHTML = `<div class="empty-state"><i class="fa-solid fa-rotate fa-spin"></i><p>Cargando opiniones...</p></div>`;

    try {
        const q = query(collection(db, "resenas"), orderBy("fecha", "desc"));
        const snapshot = await getDocs(q);
        document.getElementById("badgeResenas").textContent = snapshot.size;

        if (snapshot.empty) {
            contenedor.innerHTML = `<div class="empty-state"><i class="fa-solid fa-star"></i><p>No hay opiniones publicadas.</p></div>`;
            return;
        }

        contenedor.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const r = docSnap.data();
            const idDoc = docSnap.id;
            const num = r.calificacion || 5;
            const estrellas = Array.from({length:5}, (_,i) =>
                `<i class="fa-solid fa-star${i < num ? '' : ' empty'}"></i>`
            ).join("");

            const card = document.createElement("div");
            card.className = "card-reseña";
            card.innerHTML = `
                <div class="reseña-top">
                    <div class="reseña-stars">${estrellas}</div>
                    <span class="reseña-fecha">${r.fecha ? new Date(r.fecha).toLocaleDateString("es-MX") : "—"}</span>
                </div>
                <p class="reseña-texto">"${escapeHtml(r.texto)}"</p>
                <div class="reseña-usuario"><i class="fa-solid fa-circle-user"></i> ${escapeHtml(r.usuario || "Anónimo")}</div>
                <button type="button" class="btn btn-danger btn-sm" style="margin-top:10px;width:100%;">
                    <i class="fa-solid fa-trash-can"></i> Eliminar
                </button>
            `;
            card.querySelector("button").addEventListener("click", () => eliminarReseñaInapropiada(idDoc));
            contenedor.appendChild(card);
        });
    } catch (err) {
        console.error(err);
    }
}

async function eliminarReseñaInapropiada(idDoc) {
    const result = await Swal.fire({
        title: "¿Eliminar este comentario?",
        text: "Desaparecerá permanentemente del sitio público.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#7b5533",
        confirmButtonText: "Sí, borrar",
        cancelButtonText: "Cancelar"
    });
    if (!result.isConfirmed) return;
    try {
        await deleteDoc(doc(db, "resenas", idDoc));
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Reseña eliminada", showConfirmButton: false, timer: 1600 });
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
