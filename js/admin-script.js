import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, getDocs, doc,
    updateDoc, deleteDoc, addDoc, getDoc, query, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// ── Init Firebase ──────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Estado global ──────────────────────────────────────────────────
let vistaActiva     = "pedidos";
let todosLosPedidos = [];
let filtroActivo    = "todos";
let busquedaActual  = "";

const ADMIN_EMAILS_RESPALDO = ["educyto08@gmail.com"];

// ── Helpers ────────────────────────────────────────────────────────
function esc(texto) {
    const d = document.createElement("div");
    d.textContent = texto ?? "";
    return d.innerHTML;
}

function iniciales(nombre = "") {
    return nombre.trim().split(" ").slice(0, 2)
        .map(w => w[0]?.toUpperCase() || "").join("") || "?";
}

function formatFecha(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("es-MX", {
        day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit"
    });
}

function parseMonto(str) {
    if (typeof str === "number") return str;
    return parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;
}

function dotClass(estado = "") {
    if (estado.includes("Horno"))   return "dot-horno";
    if (estado.includes("camino"))  return "dot-horno";
    if (estado.includes("Listo") || estado.includes("Entregado")) return "dot-listo";
    return "dot-recibido";
}

function generarCodigoPedido() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "M-"; // prefijo M de Manual
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function toast(icon, title) {
    Swal.mixin({ toast: true, position: "top-end", showConfirmButton: false, timer: 1800, timerProgressBar: true })
        .fire({ icon, title });
}

// ── Auth ───────────────────────────────────────────────────────────
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

function ocultarLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.classList.add("oculto");
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        ocultarLoading();
        await Swal.fire({
            title: "Acceso denegado ❌",
            text: "Debes iniciar sesión en la tienda principal antes de entrar al panel.",
            icon: "error",
            confirmButtonColor: "#7b5533"
        });
        window.location.href = "index.html";
        return;
    }

    const lista = await obtenerEmailsAdmin();
    if (!lista.includes(user.email)) {
        ocultarLoading();
        await Swal.fire({
            title: "Sin permisos 👨‍🍳❌",
            text: "Tu cuenta no tiene acceso a este panel de administración.",
            icon: "error",
            confirmButtonColor: "#7b5533"
        });
        window.location.href = "index.html";
        return;
    }

    ocultarLoading();
    cargarPedidosAdmin();
    // Inicializar formulario manual con 1 producto vacío
    agregarLineaProducto();
});

// ── KPIs ───────────────────────────────────────────────────────────
function actualizarKPIs(pedidos) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const deHoy     = pedidos.filter(p => new Date(p.fechaCreacion) >= hoy);
    const enProceso = pedidos.filter(p =>
        !p.estado?.includes("Listo") && !p.estado?.includes("Entregado")
    );
    const entregados = pedidos.filter(p =>
        p.estado?.includes("Listo") || p.estado?.includes("Entregado")
    );
    const total = pedidos.reduce((s, p) => s + parseMonto(p.total), 0);

    document.getElementById("kpiPedidosHoy").textContent  = deHoy.length;
    document.getElementById("kpiEnProceso").textContent   = enProceso.length;
    document.getElementById("kpiEntregados").textContent  = entregados.length;
    document.getElementById("kpiVentaTotal").textContent  = "$" + total.toFixed(0);
    document.getElementById("badgePedidos").textContent   = pedidos.length;
}

// ── Render pedidos ─────────────────────────────────────────────────
function renderPedidos(lista) {
    const c = document.getElementById("contenedorPedidosAdmin");

    if (!lista.length) {
        c.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-receipt"></i>
                <p>Sin pedidos con ese filtro.</p>
            </div>`;
        return;
    }

    c.innerHTML = "";
    lista.forEach(p => {
        const ini    = iniciales(p.cliente);
        const dc     = dotClass(p.estado || "");
        const esDom  = (p.metodoEntrega || "").toLowerCase().includes("domicilio");
        const estado = p.estado || "Recibido 🥖";
        const esManual = p.esManual === true;

        const productosHTML = Array.isArray(p.productos) && p.productos.length
            ? p.productos.map(pr =>
                `<li>
                    <span>${esc(String(pr.cantidad))}× ${esc(pr.nombre)}</span>
                    <span>$${(pr.precio * pr.cantidad).toFixed(2)}</span>
                </li>`
              ).join("")
            : `<li><span style="color:var(--muted)">Sin detalle de productos</span></li>`;

        const cuponTag = (p.cuponUsado && p.cuponUsado !== "Ninguno")
            ? `<span class="cupon-tag">🎟 ${esc(p.cuponUsado)}</span>` : "";

        const manualTag = esManual
            ? `<span class="tag-manual">📝 Manual</span>` : "";

        const notasHTML = p.notas
            ? `<div style="font-size:.78rem;color:var(--muted);background:var(--cream);padding:6px 10px;border-radius:6px;">
                   <i class="fa-solid fa-note-sticky" style="margin-right:5px;"></i>${esc(p.notas)}
               </div>` : "";

        const telefonoHTML = p.telefono
            ? `<div class="pedido-cliente-meta">📞 ${esc(p.telefono)}</div>` : "";

        const card = document.createElement("div");
        card.className = "card-pedido";
        card.id = "card-" + p._id;
        card.innerHTML = `
            <div class="card-pedido-top">
                <span class="pedido-estado-dot ${dc}"></span>
                <span class="pedido-codigo">${esc(p.codigoPedido || "#---")}</span>
                ${manualTag}
                ${cuponTag}
                <span class="pedido-fecha">${formatFecha(p.fechaCreacion)}</span>
            </div>
            <div class="card-pedido-body">
                <div class="pedido-cliente-row">
                    <div class="avatar-circle">${esc(ini)}</div>
                    <div>
                        <div class="pedido-cliente-nombre">${esc(p.cliente || "Cliente")}</div>
                        ${telefonoHTML}
                        <div class="pedido-cliente-meta">
                            📅 ${esc(p.fechaRecoleccion || "—")} · ${esc(p.horarioRecoleccion || "—")}
                        </div>
                    </div>
                </div>
                <ul class="pedido-productos-lista">${productosHTML}</ul>
                ${notasHTML}
                <div class="pedido-entrega-badge ${esDom ? "entrega-domicilio" : "entrega-tienda"}">
                    <i class="fa-solid ${esDom ? "fa-motorcycle" : "fa-store"}"></i>
                    <div>
                        <div>${esc(p.metodoEntrega || "Recoger en tienda")}</div>
                        ${esDom && p.direccionEntrega
                            ? `<div class="pedido-dir">${esc(p.direccionEntrega)}</div>` : ""}
                    </div>
                </div>
            </div>
            <div class="card-pedido-footer">
                <div class="pedido-total">
                    <span>Total</span>${esc(String(p.total || "$0.00"))}
                </div>
                <select class="select-estado" aria-label="Cambiar estado del pedido">
                    <option ${estado === "Recibido 🥖"            ? "selected" : ""}>Recibido 🥖</option>
                    <option ${estado === "En el horno 🔥"         ? "selected" : ""}>En el horno 🔥</option>
                    <option ${estado === "Listo para recoger ✅"  ? "selected" : ""}>Listo para recoger ✅</option>
                    <option ${estado === "En camino 🏍️"           ? "selected" : ""}>En camino 🏍️</option>
                    <option ${estado === "Entregado 🎉"           ? "selected" : ""}>Entregado 🎉</option>
                </select>
                <button class="btn-delete-pedido" title="Eliminar este pedido" aria-label="Eliminar pedido">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;

        card.querySelector(".select-estado").addEventListener("change", async (e) => {
            await cambiarEstadoPedido(p._id, e.target.value, card);
            const ref = todosLosPedidos.find(x => x._id === p._id);
            if (ref) ref.estado = e.target.value;
            actualizarKPIs(todosLosPedidos);
        });

        card.querySelector(".btn-delete-pedido").addEventListener("click", () => {
            eliminarPedidoIndividual(p._id, card);
        });

        c.appendChild(card);
    });
}

// ── Aplicar filtros + búsqueda ─────────────────────────────────────
function aplicarFiltros() {
    let lista = [...todosLosPedidos];

    if (filtroActivo !== "todos") {
        lista = lista.filter(p => (p.estado || "").includes(filtroActivo));
    }

    if (busquedaActual.trim()) {
        const q = busquedaActual.toLowerCase().trim();
        lista = lista.filter(p =>
            (p.cliente || "").toLowerCase().includes(q) ||
            (p.codigoPedido || "").toLowerCase().includes(q)
        );
    }

    renderPedidos(lista);
}

// ── Filtros públicos ───────────────────────────────────────────────
function filtrarPedidos(filtro, btn) {
    filtroActivo = filtro;
    document.querySelectorAll(".filtro-chip").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    aplicarFiltros();
}

function buscarEnPedidos(val) {
    busquedaActual = val;
    aplicarFiltros();
}

// ── Cambiar estado en Firestore ────────────────────────────────────
async function cambiarEstadoPedido(idDoc, nuevoEstado, card) {
    try {
        await updateDoc(doc(db, "pedidos", idDoc), { estado: nuevoEstado });
        if (card) {
            const dot = card.querySelector(".pedido-estado-dot");
            if (dot) dot.className = "pedido-estado-dot " + dotClass(nuevoEstado);
        }
        toast("success", "Estado actualizado ✓");
    } catch (err) {
        console.error("Error actualizando estado:", err);
        Swal.fire("Error", "No se pudo actualizar el estado. Revisa tu conexión.", "error");
    }
}

// ── Eliminar pedido individual ─────────────────────────────────────
async function eliminarPedidoIndividual(idDoc, card) {
    const result = await Swal.fire({
        title: "¿Eliminar este pedido?",
        text: "Esta acción no se puede deshacer.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#7b5533",
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar"
    });

    if (!result.isConfirmed) return;

    try {
        await deleteDoc(doc(db, "pedidos", idDoc));

        // Animación de salida
        card.style.opacity = "0";
        card.style.transform = "scale(.95)";
        card.style.transition = "all .3s";
        setTimeout(() => {
            card.remove();
            // Quitar del array en memoria
            todosLosPedidos = todosLosPedidos.filter(p => p._id !== idDoc);
            actualizarKPIs(todosLosPedidos);
        }, 300);

        toast("success", "Pedido eliminado");
    } catch (err) {
        console.error("Error eliminando pedido:", err);
        Swal.fire("Error", "No se pudo eliminar el pedido.", "error");
    }
}

// ── Eliminar TODOS los pedidos ─────────────────────────────────────
async function eliminarTodosLosPedidos() {
    if (!todosLosPedidos.length) {
        toast("info", "No hay pedidos para eliminar");
        return;
    }

    const result = await Swal.fire({
        title: "¿Eliminar TODOS los pedidos?",
        html: `<p>Esta acción borrará <strong>${todosLosPedidos.length} pedido(s)</strong> de Firestore de forma permanente.</p>`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#7b5533",
        confirmButtonText: "Sí, borrar todo",
        cancelButtonText: "Cancelar"
    });

    if (!result.isConfirmed) return;

    // Segunda confirmación
    const conf2 = await Swal.fire({
        title: "Confirma de nuevo",
        text: "Escribe BORRAR para confirmar",
        input: "text",
        inputPlaceholder: "BORRAR",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#7b5533",
        confirmButtonText: "Eliminar definitivamente",
        cancelButtonText: "Cancelar",
        preConfirm: (val) => {
            if (val !== "BORRAR") {
                Swal.showValidationMessage("Escribe exactamente: BORRAR");
                return false;
            }
            return true;
        }
    });

    if (!conf2.isConfirmed) return;

    try {
        // Firestore writeBatch acepta hasta 500 ops; para más pedidos se divide
        const ids = todosLosPedidos.map(p => p._id);
        const CHUNK = 490;
        for (let i = 0; i < ids.length; i += CHUNK) {
            const batch = writeBatch(db);
            ids.slice(i, i + CHUNK).forEach(id => batch.delete(doc(db, "pedidos", id)));
            await batch.commit();
        }

        todosLosPedidos = [];
        actualizarKPIs([]);
        aplicarFiltros();
        toast("success", "Todos los pedidos eliminados");
    } catch (err) {
        console.error("Error al borrar todos los pedidos:", err);
        Swal.fire("Error", "No se pudieron eliminar todos los pedidos.", "error");
    }
}

// ── Cargar pedidos desde Firestore ─────────────────────────────────
async function cargarPedidosAdmin() {
    const c = document.getElementById("contenedorPedidosAdmin");
    if (!c) return;

    c.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-rotate fa-spin"></i>
            <p>Cargando pedidos...</p>
        </div>`;

    try {
        const snap = await getDocs(query(collection(db, "pedidos"), orderBy("fechaCreacion", "desc")));
        todosLosPedidos = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
        actualizarKPIs(todosLosPedidos);
        aplicarFiltros();
    } catch (err) {
        console.error("Error cargando pedidos:", err);
        c.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Error al cargar pedidos. Revisa tu conexión o los permisos de Firestore.</p>
            </div>`;
    }
}

// ── Cargar reseñas desde Firestore ─────────────────────────────────
async function cargarResenasAdmin() {
    const c = document.getElementById("contenedorResenasAdmin");
    if (!c) return;

    c.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-rotate fa-spin"></i>
            <p>Cargando opiniones...</p>
        </div>`;

    try {
        const snap = await getDocs(query(collection(db, "resenas"), orderBy("fecha", "desc")));
        document.getElementById("badgeResenas").textContent = snap.size;

        if (snap.empty) {
            c.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-star"></i>
                    <p>Aún no hay reseñas publicadas.</p>
                </div>`;
            return;
        }

        c.innerHTML = "";
        snap.forEach(docSnap => {
            const r     = docSnap.data();
            const idDoc = docSnap.id;
            const num   = Math.min(Math.max(parseInt(r.calificacion) || 5, 1), 5);

            const estrellas = Array.from({ length: 5 }, (_, i) =>
                i < num
                    ? `<i class="fa-solid fa-star"></i>`
                    : `<i class="fa-regular fa-star vacio"></i>`
            ).join("");

            const card = document.createElement("div");
            card.className = "card-resena";
            card.innerHTML = `
                <div class="resena-top">
                    <div class="resena-stars">${estrellas}</div>
                    <span class="resena-calificacion-badge">
                        <i class="fa-solid fa-star"></i> ${num}/5
                    </span>
                    <span class="resena-fecha">${formatFecha(r.fecha)}</span>
                </div>
                <p class="resena-texto">"${esc(r.texto || "")}"</p>
                <div class="resena-usuario">
                    <i class="fa-solid fa-circle-user"></i>
                    ${esc(r.usuario || "Anónimo")}
                </div>
                <button type="button" class="btn btn-danger btn-sm" style="margin-top:6px;width:100%;">
                    <i class="fa-solid fa-trash-can"></i> Eliminar reseña
                </button>
            `;

            card.querySelector("button").addEventListener("click", () =>
                eliminarResena(idDoc, card)
            );
            c.appendChild(card);
        });

    } catch (err) {
        console.error("Error cargando reseñas:", err);
        c.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Error al cargar reseñas.</p>
            </div>`;
    }
}

// ── Eliminar reseña ────────────────────────────────────────────────
async function eliminarResena(idDoc, card) {
    const result = await Swal.fire({
        title: "¿Eliminar esta reseña?",
        text: "Esta acción no se puede deshacer.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#7b5533",
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar"
    });

    if (!result.isConfirmed) return;

    try {
        await deleteDoc(doc(db, "resenas", idDoc));
        card.style.opacity = "0";
        card.style.transform = "scale(.95)";
        card.style.transition = "all .3s";
        setTimeout(() => {
            card.remove();
            const badge = document.getElementById("badgeResenas");
            const actual = parseInt(badge.textContent) || 1;
            badge.textContent = Math.max(0, actual - 1);
        }, 300);
        toast("success", "Reseña eliminada");
    } catch (err) {
        console.error("Error eliminando reseña:", err);
        Swal.fire("Error", "No se pudo eliminar la reseña.", "error");
    }
}

// ══════════════════════════════════════════════════════════════════
// ── PEDIDO MANUAL ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

let contadorLineas = 0;

function agregarLineaProducto() {
    contadorLineas++;
    const id = `linea_${contadorLineas}`;
    const lista = document.getElementById("productosManualLista");

    const div = document.createElement("div");
    div.className = "producto-linea";
    div.id = id;
    div.innerHTML = `
        <input class="form-input" type="text"   placeholder="Nombre del producto"  data-campo="nombre">
        <input class="form-input" type="number" placeholder="Cant." min="1" value="1" data-campo="cantidad" style="text-align:center;">
        <input class="form-input" type="number" placeholder="Precio $" min="0" step="0.01" data-campo="precio">
        <button class="btn-rm-producto" type="button" title="Quitar línea" onclick="quitarLineaProducto('${id}')">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    // Actualizar total al escribir
    div.querySelectorAll("input").forEach(inp =>
        inp.addEventListener("input", actualizarTotalPreview)
    );

    lista.appendChild(div);
    actualizarTotalPreview();
}

function quitarLineaProducto(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    actualizarTotalPreview();
}

function actualizarTotalPreview() {
    const lineas = document.querySelectorAll("#productosManualLista .producto-linea");
    let total = 0;
    lineas.forEach(l => {
        const cant   = parseFloat(l.querySelector("[data-campo='cantidad']")?.value) || 0;
        const precio = parseFloat(l.querySelector("[data-campo='precio']")?.value)   || 0;
        total += cant * precio;
    });
    const preview = document.getElementById("totalPreviewManual");
    if (preview) preview.textContent = `Total: $${total.toFixed(2)}`;
}

function toggleDireccion() {
    const sel   = document.getElementById("m_entrega");
    const grupo = document.getElementById("grupoDir");
    if (!sel || !grupo) return;
    grupo.style.display = sel.value.includes("domicilio") ? "flex" : "none";
}

function limpiarFormularioManual() {
    ["m_nombre","m_telefono","m_fecha","m_horario","m_notas","m_direccion"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const sel = document.getElementById("m_entrega");
    if (sel) sel.value = "Recoger en tienda";
    toggleDireccion();

    const lista = document.getElementById("productosManualLista");
    if (lista) lista.innerHTML = "";
    contadorLineas = 0;
    agregarLineaProducto();
    actualizarTotalPreview();
}

async function guardarPedidoManual() {
    // Validaciones básicas
    const nombre  = (document.getElementById("m_nombre")?.value || "").trim();
    const fecha   = (document.getElementById("m_fecha")?.value || "").trim();
    const horario = (document.getElementById("m_horario")?.value || "").trim();

    if (!nombre) {
        Swal.fire("Campo requerido", "Escribe el nombre del cliente.", "warning");
        return;
    }
    if (!fecha) {
        Swal.fire("Campo requerido", "Selecciona la fecha de recolección.", "warning");
        return;
    }
    if (!horario) {
        Swal.fire("Campo requerido", "Escribe el horario de recolección.", "warning");
        return;
    }

    // Recolectar productos
    const lineas  = document.querySelectorAll("#productosManualLista .producto-linea");
    const productos = [];
    let totalNum  = 0;
    let productoValido = false;

    lineas.forEach(l => {
        const nombre_p = (l.querySelector("[data-campo='nombre']")?.value || "").trim();
        const cantidad  = parseFloat(l.querySelector("[data-campo='cantidad']")?.value) || 0;
        const precio    = parseFloat(l.querySelector("[data-campo='precio']")?.value)   || 0;
        if (nombre_p && cantidad > 0) {
            productos.push({ nombre: nombre_p, cantidad, precio });
            totalNum += cantidad * precio;
            productoValido = true;
        }
    });

    if (!productoValido) {
        Swal.fire("Sin productos", "Agrega al menos un producto con nombre y cantidad.", "warning");
        return;
    }

    const metodoEntrega   = document.getElementById("m_entrega")?.value  || "Recoger en tienda";
    const direccionEntrega = (document.getElementById("m_direccion")?.value || "").trim();
    const telefono        = (document.getElementById("m_telefono")?.value || "").trim();
    const notas           = (document.getElementById("m_notas")?.value    || "").trim();

    // Construir documento
    const nuevoPedido = {
        cliente:           nombre,
        telefono:          telefono || null,
        fechaRecoleccion:  fecha,
        horarioRecoleccion: horario,
        metodoEntrega,
        direccionEntrega:  metodoEntrega.includes("domicilio") ? direccionEntrega : null,
        productos,
        total:             `$${totalNum.toFixed(2)}`,
        totalNum,
        notas:             notas || null,
        estado:            "Recibido 🥖",
        codigoPedido:      generarCodigoPedido(),
        fechaCreacion:     Date.now(),
        esManual:          true,      // ← marca que fue creado desde el panel
        cuponUsado:        "Ninguno"
    };

    try {
        const docRef = await addDoc(collection(db, "pedidos"), nuevoPedido);

        toast("success", "Pedido registrado ✓");

        // Agregar a la memoria local y actualizar KPIs
        todosLosPedidos.unshift({ _id: docRef.id, ...nuevoPedido });
        actualizarKPIs(todosLosPedidos);

        // Preguntar si quiere ir a ver los pedidos
        const ir = await Swal.fire({
            title: "¡Pedido guardado! 🥐",
            html: `<p>Código: <strong>${nuevoPedido.codigoPedido}</strong></p><p>Cliente: ${nombre}</p><p>Total: $${totalNum.toFixed(2)}</p>`,
            icon: "success",
            showCancelButton: true,
            confirmButtonColor: "#7b5533",
            cancelButtonColor: "#6b7280",
            confirmButtonText: "Ver pedidos",
            cancelButtonText: "Registrar otro"
        });

        if (ir.isConfirmed) {
            cambiarSeccionAdmin("pedidos", document.getElementById("navPedidos"));
        } else {
            limpiarFormularioManual();
        }

    } catch (err) {
        console.error("Error guardando pedido manual:", err);
        Swal.fire("Error", "No se pudo guardar el pedido. Revisa tu conexión.", "error");
    }
}

// ── Navegación entre secciones ─────────────────────────────────────
function cambiarSeccionAdmin(seccion, btn) {
    vistaActiva = seccion;

    document.querySelectorAll(".seccion").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

    const secEl = document.getElementById(
        "seccion" + seccion.charAt(0).toUpperCase() + seccion.slice(1)
    );
    if (secEl) secEl.classList.add("active");
    if (btn)   btn.classList.add("active");

    const titulos = {
        pedidos: ["Pedidos recibidos",       "Gestiona y actualiza el estado de cada comanda"],
        manual:  ["Pedido manual",            "Registra un pedido para cliente sin cuenta en la app"],
        resenas: ["Opiniones de clientes",   "Modera las reseñas publicadas en la tienda"]
    };
    document.getElementById("topbarTitle").textContent = titulos[seccion]?.[0] ?? "";
    document.getElementById("topbarSub").textContent   = titulos[seccion]?.[1] ?? "";

    // Ocultar el botón Sincronizar en la sección manual (no aplica)
    const btnSync = document.getElementById("btnSincronizar");
    if (btnSync) btnSync.style.display = seccion === "manual" ? "none" : "";

    if (seccion === "resenas") cargarResenasAdmin();
    else if (seccion === "pedidos") cargarPedidosAdmin();
}

function actualizarVistaActivaAdmin() {
    const btn = document.getElementById("btnSincronizar");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-rotate fa-spin"></i> Sincronizando...`;
    }
    const done = () => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-rotate"></i> Sincronizar`;
        }
    };

    if (vistaActiva === "resenas") {
        cargarResenasAdmin().finally(done);
    } else {
        cargarPedidosAdmin().finally(done);
    }

    toast("info", "Sincronizando datos...");
}

function regresarAlSitioPublico() {
    window.location.href = "index.html";
}

// ── Exponer al HTML ────────────────────────────────────────────────
Object.assign(window, {
    cambiarSeccionAdmin,
    actualizarVistaActivaAdmin,
    regresarAlSitioPublico,
    filtrarPedidos,
    buscarEnPedidos,
    agregarLineaProducto,
    quitarLineaProducto,
    limpiarFormularioManual,
    guardarPedidoManual,
    eliminarTodosLosPedidos,
    toggleDireccion
});
