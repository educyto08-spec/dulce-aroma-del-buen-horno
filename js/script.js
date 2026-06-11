import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    firebaseConfig, WHATSAPP_NUMERO, CARRITO_STORAGE_KEY, CARRITO_STORAGE_LEGACY, COSTO_ENVIO_DOMICILIO
} from "./firebase-config.js";
import { PRODUCTOS_CATALOGO, ETIQUETAS_CATEGORIA } from "./productos.js";
import { alternarFavorito, esFavorito, iniciarExperiencia, sumarPuntos, obtenerPuntos, canjearCuponSorpresa } from "./experiencia.js";

const app = initializeApp(firebaseConfig);
const ULTIMO_PEDIDO_KEY = "dulce-aroma-ultimo-pedido";
const db = getFirestore(app);
const auth = getAuth(app);

let carrito = [];
let categoriaActiva = "todos";
let usuarioLogueado = null;
let correoUsuarioLogueado = null;
let estrellasSeleccionadas = 5;
let idDocumentoUsuarioFirestore = null;
let cuponAplicado = null;
let descuentoActual = 0;
let metodoEntrega = "tienda";
let catalogoActual = [];
let soloDisponibles = false;
let soloFavoritos = false;
let ordenCatalogo = "default";

function calcularResumenCarrito() {
    const subtotal = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const envio = metodoEntrega === "domicilio" ? COSTO_ENVIO_DOMICILIO : 0;
    const total = Math.max(0, subtotal - descuentoActual + envio);
    return { subtotal, envio, descuento: descuentoActual, total };
}

function actualizarResumenPrecios() {
    const { subtotal, envio, descuento, total } = calcularResumenCarrito();
    const elSub = document.getElementById("resumenSubtotal");
    const elDesc = document.getElementById("resumenDescuento");
    const elEnv = document.getElementById("resumenEnvio");
    const elTotal = document.getElementById("cartTotalText");
    const lineaDesc = document.getElementById("lineaDescuento");
    const lineaEnv = document.getElementById("lineaEnvio");

    if (elSub) elSub.textContent = `$${subtotal.toFixed(2)}`;
    if (elTotal) elTotal.textContent = `$${total.toFixed(2)}`;
    if (lineaDesc && elDesc) {
        const show = descuento > 0;
        lineaDesc.hidden = !show;
        if (show) elDesc.textContent = `-$${descuento.toFixed(2)}`;
    }
    if (lineaEnv && elEnv) {
        const show = envio > 0;
        lineaEnv.hidden = !show;
        if (show) elEnv.textContent = `+$${envio.toFixed(2)}`;
    }
}

function configurarMetodoEntrega() {
    const radios = document.querySelectorAll('input[name="metodoEntrega"]');
    const bloqueDir = document.getElementById("bloqueDireccionDomicilio");
    const labelCosto = document.getElementById("labelCostoEnvio");
    if (labelCosto) labelCosto.textContent = `$${COSTO_ENVIO_DOMICILIO.toFixed(2)}`;

    const aplicarMetodo = (valor) => {
        metodoEntrega = valor;
        document.querySelectorAll(".metodo-entrega-card").forEach((card) => {
            const input = card.querySelector('input[name="metodoEntrega"]');
            card.classList.toggle("is-selected", input?.value === valor);
        });
        if (bloqueDir) bloqueDir.hidden = valor !== "domicilio";
        actualizarResumenPrecios();
    };

    radios.forEach((radio) => {
        radio.addEventListener("change", () => {
            if (radio.checked) aplicarMetodo(radio.value);
        });
    });
    const checked = document.querySelector('input[name="metodoEntrega"]:checked');
    if (checked) aplicarMetodo(checked.value);
}

async function obtenerDireccionParaPedido() {
    const campo = document.getElementById("direccionEntregaPedido");
    const manual = campo?.value.trim();
    if (manual) return manual;

    const user = auth.currentUser;
    if (!user) return "";
    try {
        const qUsuarios = query(collection(db, "usuarios"), where("uid", "==", user.uid));
        const snap = await getDocs(qUsuarios);
        let dir = "";
        snap.forEach((d) => { dir = d.data().direccion || ""; });
        if (dir && campo) campo.value = dir;
        return dir;
    } catch {
        return "";
    }
}

function migrarCarritoStorage() {
    if (!localStorage.getItem(CARRITO_STORAGE_KEY) && localStorage.getItem(CARRITO_STORAGE_LEGACY)) {
        localStorage.setItem(CARRITO_STORAGE_KEY, localStorage.getItem(CARRITO_STORAGE_LEGACY));
    }
    try {
        carrito = JSON.parse(localStorage.getItem(CARRITO_STORAGE_KEY)) || [];
    } catch {
        carrito = [];
    }
}

function escapeHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

function mostrarToast(mensaje) {
    document.querySelector(".toast-notificacion")?.remove();
    const toast = document.createElement("div");
    toast.className = "toast-notificacion";
    toast.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> <span>${escapeHtml(mensaje)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 50);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function claseBadgeEstado(estado) {
    if (!estado) return "recibido";
    if (estado.includes("Horno")) return "horno";
    if (estado.includes("Listo") || estado.includes("Entregado")) return "listo";
    return "recibido";
}

// --- Menú móvil ---
function toggleMenuMovil(abrir) {
    const nav = document.getElementById("navPrincipal");
    const overlay = document.getElementById("navOverlay");
    const toggle = document.getElementById("menuToggle");
    if (!nav || !overlay || !toggle) return;

    const debeAbrir = abrir ?? !nav.classList.contains("open");
    nav.classList.toggle("open", debeAbrir);
    overlay.classList.toggle("active", debeAbrir);
    overlay.setAttribute("aria-hidden", debeAbrir ? "false" : "true");
    toggle.setAttribute("aria-expanded", debeAbrir ? "true" : "false");
    document.body.style.overflow = debeAbrir ? "hidden" : "";
}

function cerrarMenuMovil() {
    toggleMenuMovil(false);
}

// --- Catálogo dinámico ---
function productoDisponible(p) {
    return p.disponible !== false;
}

function fusionarConCatalogoLocal(remotos) {
    const porId = new Map(PRODUCTOS_CATALOGO.map((p) => [p.id, p]));
    const porNombre = new Map(PRODUCTOS_CATALOGO.map((p) => [(p.nombre || "").toLowerCase(), p]));
    const idsIncluidos = new Set();

    const fusionados = remotos.map((r) => {
        const local = porId.get(r.id) || porNombre.get((r.nombre || "").toLowerCase());
        if (local) {
            idsIncluidos.add(local.id);
            return { ...r, ...local, id: r.id || local.id };
        }
        return { ...r, disponible: false, motivoAgotado: "AGOTADO" };
    });

    PRODUCTOS_CATALOGO.forEach((local) => {
        if (!idsIncluidos.has(local.id)) fusionados.push(local);
    });

    return fusionados.length ? fusionados : [...PRODUCTOS_CATALOGO];
}

function crearTarjetaProducto(p) {
    const nombre = escapeHtml(p.nombre);
    const desc = escapeHtml(p.descripcion);
    const img = escapeHtml(p.img);
    const cat = escapeHtml(p.categoria);
    const precioNum = Number(p.precio);
    const precio = precioNum.toFixed(2);
    const agotado = !productoDisponible(p);
    const etiquetaAgotado = escapeHtml(p.motivoAgotado || "AGOTADO");
    const favActivo = esFavorito(p.id);
    const badge = p.badge
        ? `<span class="badge-producto ${escapeHtml(p.badge.tipo)}">${escapeHtml(p.badge.texto)}</span>`
        : "";
    const badgeAgotado = agotado ? `<span class="badge-agotado">${etiquetaAgotado}</span>` : "";

    const articulo = document.createElement("article");
    articulo.className = `item-producto reveal-on-scroll${agotado ? " item-producto--agotado" : ""}`;
    articulo.dataset.id = p.id;
    articulo.dataset.categoria = cat;
    articulo.dataset.nombre = (p.nombre || "").toLowerCase();
    articulo.dataset.descripcion = (p.descripcion || "").toLowerCase();
    articulo.dataset.disponible = agotado ? "no" : "si";
    articulo.dataset.precio = String(precioNum);
    articulo.dataset.favorito = favActivo ? "si" : "no";
    articulo.innerHTML = `
        <div class="img-wrapper producto-img-click">
            ${badge}
            ${badgeAgotado}
            <button type="button" class="btn-favorito${favActivo ? " activo" : ""}" aria-label="Guardar en favoritos" aria-pressed="${favActivo ? "true" : "false"}">
                <i class="fa-${favActivo ? "solid" : "regular"} fa-heart" aria-hidden="true"></i>
            </button>
            <img src="${img}" alt="${nombre}" loading="lazy" decoding="async" width="260" height="180"
                 onerror="this.style.display='none';">
            <span class="overlay-ver-detalle"><i class="fa-solid fa-expand" aria-hidden="true"></i> Ver detalle</span>
        </div>
        <h4>${nombre}</h4>
        <p class="descripcion">${desc}</p>
        <p class="precio">${agotado ? '<span class="precio-tachado">$' + precio + '</span> <span class="precio-no-disponible">No disponible</span>' : '$' + precio}</p>
        <button type="button" class="btn-pedir${agotado ? " btn-pedir--agotado" : ""}" ${agotado ? "disabled" : ""}>
            <i class="fa-solid ${agotado ? "fa-ban" : "fa-plus"}" aria-hidden="true"></i> ${agotado ? "Agotado" : "Agregar"}
        </button>
    `;

    articulo.querySelector(".btn-favorito").addEventListener("click", (e) => {
        e.stopPropagation();
        const on = alternarFavorito(p.id);
        const btn = e.currentTarget;
        btn.classList.toggle("activo", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.querySelector("i").className = `fa-${on ? "solid" : "regular"} fa-heart`;
        articulo.dataset.favorito = on ? "si" : "no";
        if (soloFavoritos) aplicarFiltrosVisuales();
    });

    articulo.querySelector(".producto-img-click").addEventListener("click", (e) => {
        if (e.target.closest(".btn-favorito")) return;
        window.abrirVistaRapida?.(p.id);
    });

    if (!agotado) {
        articulo.querySelector(".btn-pedir").addEventListener("click", () => {
            agregarAlCarrito(p.nombre, precioNum, p.img);
        });
    }
    return articulo;
}

function ordenarListaProductos(lista) {
    const copia = [...lista];
    if (ordenCatalogo === "precio-asc") copia.sort((a, b) => Number(a.precio) - Number(b.precio));
    else if (ordenCatalogo === "precio-desc") copia.sort((a, b) => Number(b.precio) - Number(a.precio));
    else if (ordenCatalogo === "nombre") copia.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
    else copia.sort((a, b) => (productoDisponible(b) ? 1 : 0) - (productoDisponible(a) ? 1 : 0));
    return copia;
}

function renderizarCatalogo(lista) {
    const grid = document.getElementById("grid-productos");
    if (!grid) return;
    catalogoActual = lista;
    grid.innerHTML = "";
    ordenarListaProductos(lista).forEach((p) => grid.appendChild(crearTarjetaProducto(p)));
    aplicarFiltrosVisuales();
    document.dispatchEvent(new CustomEvent("catalogo:listo", { detail: { catalogo: lista } }));
}

async function inicializarCatalogo() {
    const grid = document.getElementById("grid-productos");
    if (!grid) return;
    grid.innerHTML = '<p class="catalogo-cargando">Cargando catálogo...</p>';

    let productos = [...PRODUCTOS_CATALOGO];
    try {
        const snap = await getDocs(collection(db, "productos"));
        if (!snap.empty) {
            productos = fusionarConCatalogoLocal(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
    } catch (e) {
        console.warn("Catálogo desde Firestore no disponible, usando lista local.", e);
    }
    renderizarCatalogo(productos);
}

function aplicarFiltrosVisuales() {
    const texto = (document.getElementById("inputBuscador")?.value || "").toLowerCase().trim();
    const items = document.querySelectorAll(".item-producto");
    let visibles = 0;

    items.forEach((producto) => {
        const cat = producto.dataset.categoria;
        const nombre = producto.dataset.nombre || "";
        const desc = producto.dataset.descripcion || "";
        const etiquetaCat = (ETIQUETAS_CATEGORIA[cat] || cat).toLowerCase();

        const coincideCategoria = categoriaActiva === "todos" || cat === categoriaActiva;
        const coincideTexto = !texto || nombre.includes(texto) || desc.includes(texto) || etiquetaCat.includes(texto) || cat.includes(texto);
        const pasaDisponible = !soloDisponibles || producto.dataset.disponible === "si";
        const pasaFavorito = !soloFavoritos || producto.dataset.favorito === "si";

        const mostrar = coincideCategoria && coincideTexto && pasaDisponible && pasaFavorito;
        producto.style.display = mostrar ? "flex" : "none";
        if (mostrar) visibles++;
    });

    const msg = document.getElementById("mensajeSinResultados");
    if (msg) msg.hidden = visibles > 0 || items.length === 0;
}

function buscarProductos() {
    const botones = document.querySelectorAll(".btn-categoria");
    botones.forEach((btn) => btn.classList.remove("active"));
    const btnTodos = document.querySelector('.btn-categoria[data-categoria="todos"]');
    if (btnTodos) {
        btnTodos.classList.add("active");
        categoriaActiva = "todos";
    }
    aplicarFiltrosVisuales();
}

function filtrarCategoria(categoria, btn) {
    document.getElementById("inputBuscador").value = "";
    categoriaActiva = categoria;
    document.querySelectorAll(".btn-categoria").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    aplicarFiltrosVisuales();
}

// --- Navegación ---
function scrollAlCatalogo() {
    cerrarMenuMovil();
    document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" });
}

function enfocarBuscador() {
    cerrarMenuMovil();
    const seccion = document.getElementById("productos");
    const input = document.getElementById("inputBuscador");
    if (!seccion || !input) return;
    seccion.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => input.focus(), 400);
}

function openSide(id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.add("active");
    document.body.style.overflow = "hidden";
    const cerrar = panel.querySelector(".close-side");
    cerrar?.focus();
    if (id === "sideCuenta") {
        conmutarModoEdicionPerfil(false);
        cargarPerfilUsuario();
    }
}

function closeSide(id) {
    document.getElementById(id)?.classList.remove("active");
    if (!document.querySelector(".side-panel.active")) {
        document.body.style.overflow = "";
    }
}

// --- Auth ---
function openAuth() {
    const modal = document.getElementById("modalAuth");
    if (modal) {
        modal.style.display = "flex";
        document.getElementById("loginCorreo")?.focus();
    }
}

function closeAuth() {
    const modal = document.getElementById("modalAuth");
    if (modal) modal.style.display = "none";
}

function switchTab(type) {
    const loginForm = document.getElementById("formLogin");
    const registerForm = document.getElementById("formRegister");
    const btnLogin = document.getElementById("btnTabLogin");
    const btnRegister = document.getElementById("btnTabRegister");
    const esLogin = type === "login";
    loginForm.style.display = esLogin ? "block" : "none";
    registerForm.style.display = esLogin ? "none" : "block";
    registerForm.classList.toggle("perfil-formulario", esLogin);
    btnLogin.classList.toggle("active", esLogin);
    btnRegister.classList.toggle("active", !esLogin);
}

function togglePasswordVisibility(inputId, icon) {
    const passInput = document.getElementById(inputId);
    const esPassword = passInput.type === "password";
    passInput.type = esPassword ? "text" : "password";
    icon.classList.toggle("fa-eye", !esPassword);
    icon.classList.toggle("fa-eye-slash", esPassword);
    icon.setAttribute("aria-label", esPassword ? "Ocultar contraseña" : "Mostrar contraseña");
}

async function handleLogin(event) {
    event.preventDefault();
    const correo = document.getElementById("loginCorreo").value.trim();
    const contrasena = document.getElementById("loginPassword").value;
    const btnSubmit = event.target.querySelector(".btn-submit-auth");
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Verificando...';

    try {
        await signInWithEmailAndPassword(auth, correo, contrasena);
        closeAuth();
        document.getElementById("formLogin").reset();
        Swal.fire({ title: "¡Bienvenido de vuelta! 🥐", text: "Tu sesión ha iniciado correctamente.", icon: "success", confirmButtonColor: "#7b5533", timer: 2000, timerProgressBar: true });
    } catch (error) {
        let mensaje = "Error al iniciar sesión. Inténtalo de nuevo más tarde.";
        if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(error.code)) {
            mensaje = "El correo o la contraseña que ingresaste son incorrectos.";
        }
        Swal.fire({ title: "¡Oh no! 🥖", text: mensaje, icon: "error", confirmButtonColor: "#7b5533" });
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = textoOriginal;
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const nombre = document.getElementById("regNombre").value.trim().toUpperCase();
    const apellidos = document.getElementById("regApellidos").value.trim().toUpperCase();
    const correo = document.getElementById("regCorreo").value.trim();
    const telefono = document.getElementById("regTelefono").value.trim();
    const contrasena = document.getElementById("regPassword").value;
    const direccion = document.getElementById("regDireccion").value.trim();
    const btnSubmit = event.target.querySelector(".btn-submit-auth");
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Horneando cuenta...';

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, correo, contrasena);
        await addDoc(collection(db, "usuarios"), {
            uid: userCredential.user.uid,
            nombre, apellidos, correo, telefono, direccion,
            fechaRegistro: Date.now()
        });
        closeAuth();
        document.getElementById("formRegister").reset();
        Swal.fire({ title: `¡Excelente, ${nombre}! 🎉`, text: "Tu cuenta ha sido creada con éxito.", icon: "success", confirmButtonColor: "#7b5533" });
    } catch (error) {
        let mensaje = "No se pudo crear la cuenta. Inténtalo de nuevo.";
        if (error.code === "auth/email-already-in-use") mensaje = "Este correo ya está registrado.";
        else if (error.code === "auth/weak-password") mensaje = "La contraseña debe tener al menos 6 caracteres.";
        Swal.fire({ title: "Error de Registro ❌", text: mensaje, icon: "warning", confirmButtonColor: "#7b5533" });
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = textoOriginal;
    }
}

async function cerrarSesionUsuario() {
    try {
        await signOut(auth);
        closeSide("sideCuenta");
        mostrarToast("Has cerrado sesión.");
    } catch (error) {
        console.error(error);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        correoUsuarioLogueado = user.email;
        try {
            const qUsuarios = query(collection(db, "usuarios"), where("uid", "==", user.uid));
            const snap = await getDocs(qUsuarios);
            usuarioLogueado = user.email.split("@")[0].toUpperCase();
            snap.forEach((d) => { usuarioLogueado = d.data().nombre; });
        } catch {
            usuarioLogueado = user.email.split("@")[0].toUpperCase();
        }
    } else {
        usuarioLogueado = null;
        correoUsuarioLogueado = null;
        idDocumentoUsuarioFirestore = null;
    }
    actualizarInterfazUsuario();
    renderizarAppExclusiva();
});

function actualizarInterfazUsuario() {
    const container = document.getElementById("userSessionContainer");
    if (!container) return;
    if (usuarioLogueado) {
        container.innerHTML = `
            <button type="button" class="btn-saludo-usuario" onclick="openSide(\'sideCuenta\')">HOLA, ${escapeHtml(usuarioLogueado)}</button>
            <button type="button" class="icon-link btn-link-danger link-sesion-texto" onclick="cerrarSesionUsuario()">SALIR</button>
        `;
    } else {
        // MODIFICACIÓN:
container.innerHTML = `
    <button type="button" onclick="openAuth()" class="icon-link" aria-label="Iniciar sesión">
        <i class="fa-regular fa-user" aria-hidden="true"></i> 
        <span class="link-sesion-texto">INICIAR SESIÓN</span>
    </button>
`;
    }
}

// --- Secciones exclusivas para PWA (standalone) ---

function renderizarAppExclusiva() {
    const seccionExclusiva = document.getElementById("appExclusivaSeccion");
    if (!seccionExclusiva) return;

    if (window.matchMedia("(display-mode: standalone)").matches && usuarioLogueado) {
        seccionExclusiva.hidden = false;
        generarQrUsuario();
        setupRaspaGana();
    } else {
        seccionExclusiva.hidden = true;
    }
}

function generarQrUsuario() {
    const qrContainer = document.getElementById("qrcodeContainer");
    const qrUserId = document.getElementById("qrUserId");

    if (!qrContainer || !qrUserId || !auth.currentUser) return;

    qrContainer.innerHTML = "";
    const userId = auth.currentUser.uid;
    qrUserId.textContent = userId.substring(0, 8);

    new QRCode(qrContainer, {
        text: userId,
        width: 128,
        height: 128,
        colorDark: "#6b4423",
        colorLight: "#f8f3ea",
        correctLevel: QRCode.CorrectLevel.H
    });
}

// --- Lógica del Raspa y Gana ---
let isScratching = false;
let lastPoint = null;
let scratchThreshold = 0.5; // 50% raspado
let scratchCount = 0; // Contador para saber cuánto se ha raspado
let ctx;

function setupRaspaGana() {
    const canvas = document.getElementById("scratchCardCanvas");
    const overlay = document.querySelector(".scratch-card-overlay");
    const mensaje = document.getElementById("raspaGanaMensaje");
    const btnNuevo = document.getElementById("btnNuevoRaspaGana");
    const puntosDisplay = document.getElementById("puntosUsuarioRaspaGana");

    if (!canvas || !overlay || !mensaje || !btnNuevo || !puntosDisplay) return;

    puntosDisplay.textContent = obtenerPuntos();

    const canPlay = obtenerPuntos() >= 100;
    canvas.style.pointerEvents = canPlay ? "auto" : "none";
    overlay.textContent = canPlay ? "¡Raspa aquí!" : "Necesitas 100 puntos para jugar";
    overlay.style.backgroundColor = canPlay ? "rgba(123, 85, 51, 0.8)" : "rgba(123, 85, 51, 0.4)";
    btnNuevo.hidden = true;
    mensaje.hidden = true;

    if (!canPlay) return;

    ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imgCover = new Image();
    imgCover.src = "img/raspa-cover.png"; // Una imagen que simula la capa a raspar
    imgCover.onload = () => {
        ctx.drawImage(imgCover, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = 30;
        ctx.lineCap = "round";
    };

    const getClientPoint = (e) => {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startScratch = (e) => {
        e.preventDefault();
        isScratching = true;
        lastPoint = getClientPoint(e);
    };

    const scratch = (e) => {
        if (!isScratching) return;
        e.preventDefault();
        const currentPoint = getClientPoint(e);
        if (lastPoint) {
            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
        }
        lastPoint = currentPoint;
        checkScratchProgress(canvas, ctx, overlay, mensaje, btnNuevo, puntosDisplay);
    };

    const endScratch = () => {
        isScratching = false;
        lastPoint = null;
    };

    canvas.addEventListener("mousedown", startScratch);
    canvas.addEventListener("mousemove", scratch);
    canvas.addEventListener("mouseup", endScratch);
    canvas.addEventListener("mouseleave", endScratch);

    canvas.addEventListener("touchstart", startScratch, { passive: false });
    canvas.addEventListener("touchmove", scratch, { passive: false });
    canvas.addEventListener("touchend", endScratch);

    btnNuevo.addEventListener("click", resetRaspaGana);
}

function checkScratchProgress(canvas, ctx, overlay, mensaje, btnNuevo, puntosDisplay) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let transparentPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) transparentPixels++;
    }
    scratchCount = transparentPixels / (canvas.width * canvas.height);

    if (scratchCount >= scratchThreshold) {
        canvas.style.pointerEvents = "none";
        overlay.style.display = "none";
        triggerRaspaGanaReward(mensaje, btnNuevo, puntosDisplay);
    }
}

function triggerRaspaGanaReward(mensaje, btnNuevo, puntosDisplay) {
    const puntosActuales = obtenerPuntos();
    if (puntosActuales >= 100) {
        // Restar puntos y aplicar cupón
        canjearCuponSorpresa(); // Esta función debería manejar la lógica del cupón y restar los puntos
        puntosDisplay.textContent = obtenerPuntos(); // Actualizar puntos después del canje
        mensaje.textContent = "¡Felicidades! Has ganado un pan gratis con tu cupón. ¡Revisa tu perfil!";
        mensaje.hidden = false;
        btnNuevo.hidden = false;
    } else {
        mensaje.textContent = "No tienes suficientes puntos para reclamar una recompensa.";
        mensaje.hidden = false;
        btnNuevo.hidden = false;
    }
}

function resetRaspaGana() {
    const canvas = document.getElementById("scratchCardCanvas");
    const overlay = document.querySelector(".scratch-card-overlay");
    const mensaje = document.getElementById("raspaGanaMensaje");
    const btnNuevo = document.getElementById("btnNuevoRaspaGana");
    const puntosDisplay = document.getElementById("puntosUsuarioRaspaGana");

    if (!canvas || !overlay || !mensaje || !btnNuevo || !puntosDisplay) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setupRaspaGana(); // Volver a configurar el estado inicial

    overlay.style.display = "flex"; // Mostrar el overlay de nuevo
    btnNuevo.hidden = true;
    mensaje.hidden = true;
}

Object.assign(window, {
    scrollAlCatalogo, enfocarBuscador, buscarProductos, openSide, closeSide,
    openAuth, closeAuth, switchTab, togglePasswordVisibility,
    cerrarSesionUsuario, agregarAlCarrito, cambiarCantidad, vaciarCarritoCompleto,
    finalizarCompraServidor, filtrarCategoria, seleccionarEstrellasVoto, enviarReseña,
    cargarReseñas, cargarPerfilUsuario, conmutarModoEdicionPerfil,
    guardarDatosPerfilActualizados, aplicarCupon, repetirUltimoPedido, mostrarToast,
    renderizarAppExclusiva // Exportar para uso externo si es necesario
});

// --- Integración Nativa: Manejo del botón "Atrás" ---
document.addEventListener("deviceready", () => {
    document.addEventListener("bac	kbutton", (e) => {
        const cart = document.getElementById("cartSidebar");
        const account = document.getElementById("sideCuenta");
        const auth = document.getElementById("modalAuth");

        if (cart?.classList.contains("active")) {
            closeSide("cartSidebar");
        } else if (account?.classList.contains("active")) {
            closeSide("sideCuenta");
        } else if (auth?.style.display === "flex") {
            closeAuth();
        } else {
            // Si no hay nada abierto, el sistema cierra la app por defecto
            console.log("Cerrando app...");
        }
    }, false);
}, false);

Object.assign(window, {
    scrollAlCatalogo, enfocarBuscador, buscarProductos, openSide, closeSide,
    openAuth, closeAuth, switchTab, togglePasswordVisibility,
    cerrarSesionUsuario, agregarAlCarrito, cambiarCantidad, vaciarCarritoCompleto,
    finalizarCompraServidor, filtrarCategoria, seleccionarEstrellasVoto, enviarReseña,
    cargarReseñas, cargarPerfilUsuario, conmutarModoEdicionPerfil,
    guardarDatosPerfilActualizados, aplicarCupon, repetirUltimoPedido, mostrarToast
});

function actualizarAvatarPerfil(fotoUrl) {
    const img = document.getElementById("perfilAvatarImg");
    const placeholder = document.getElementById("perfilAvatarPlaceholder");
    if (!img || !placeholder) return;
    if (fotoUrl) {
        img.src = fotoUrl;
        img.hidden = false;
        placeholder.hidden = true;
    } else {
        img.removeAttribute("src");
        img.hidden = true;
        placeholder.hidden = false;
    }
}

async function manejarFotoPerfil(event) {
    const file = event.target.files?.[0];
    if (!file || !idDocumentoUsuarioFirestore) return;
    if (!file.type.startsWith("image/")) {
        Swal.fire({ title: "Formato no válido", text: "Elige una imagen JPG o PNG.", icon: "warning", confirmButtonColor: "#7b5533" });
        return;
    }
    if (file.size > 800000) {
        Swal.fire({ title: "Imagen muy grande", text: "Usa una foto menor a 800 KB.", icon: "warning", confirmButtonColor: "#7b5533" });
        return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            await updateDoc(doc(db, "usuarios", idDocumentoUsuarioFirestore), { fotoPerfil: reader.result });
            actualizarAvatarPerfil(reader.result);
            mostrarToast("Foto de perfil actualizada");
        } catch (err) {
            console.error(err);
            Swal.fire({ title: "No se pudo guardar la foto", icon: "error", confirmButtonColor: "#7b5533" });
        }
    };
    reader.readAsDataURL(file);
}

async function cargarPerfilUsuario() {
    const user = auth.currentUser;
    if (!user) return;
    const elCorreo = document.getElementById("perfCorreo");
    if (elCorreo) elCorreo.innerText = user.email;

    try {
        const qUsuarios = query(collection(db, "usuarios"), where("uid", "==", user.uid));
        const userSnapshot = await getDocs(qUsuarios);

        if (!userSnapshot.empty) {
            userSnapshot.forEach((docSnap) => {
                idDocumentoUsuarioFirestore = docSnap.id;
                const ud = docSnap.data();
                const nombreCompleto = `${ud.nombre || ""} ${ud.apellidos || ""}`.trim();
                const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
                const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

                setText("perfNombre", nombreCompleto || user.email.split("@")[0].toUpperCase());
                setText("perfTelefono", ud.telefono || "No registrado");
                setText("perfDireccion", ud.direccion || "No registrada");
                setText("perfNotas", ud.notas?.trim() ? ud.notas : "Sin notas. Puedes agregar preferencias de pedido o alergias.");
                setVal("editPerfNombre", ud.nombre || "");
                setVal("editPerfApellidos", ud.apellidos || "");
                setVal("editPerfTelefono", ud.telefono || "");
                setVal("editPerfDireccion", ud.direccion || "");
                setVal("editPerfNotas", ud.notas || "");

                actualizarAvatarPerfil(ud.fotoPerfil || null);
                actualizarTarjetaLealtad();

                const miembro = document.getElementById("perfMiembroDesde");
                if (miembro && ud.fechaRegistro) {
                    miembro.textContent = `Cliente desde ${new Date(ud.fechaRegistro).toLocaleDateString("es-MX", { month: "long", year: "numeric" })}`;
                }
            });
        } else {
            document.getElementById("perfNombre").innerText = user.email.split("@")[0].toUpperCase();
            document.getElementById("perfTelefono").innerText = "No registrado";
            document.getElementById("perfDireccion").innerText = "No registrada";
            const notasEl = document.getElementById("perfNotas");
            if (notasEl) notasEl.innerText = "Sin notas.";
            actualizarAvatarPerfil(null);
            idDocumentoUsuarioFirestore = null;
        }

        const contenedorHistorial = document.getElementById("contenedorHistorialPedidos");
        contenedorHistorial.innerHTML = '<p class="text-muted">🔄 Consultando historial...</p>';

        const qPedidos = query(collection(db, "pedidos"), where("uidCliente", "==", user.uid), orderBy("fechaCreacion", "desc"));
        const pedidosSnapshot = await getDocs(qPedidos);

        if (pedidosSnapshot.empty) {
            contenedorHistorial.innerHTML = '<p class="text-muted">Aún no has realizado pedidos en nuestra web. ¡Tu pancito te espera! 🥐</p>';
            return;
        }

        contenedorHistorial.innerHTML = "";
        pedidosSnapshot.forEach((docSnap) => {
            const pedido = docSnap.data();
            const estado = pedido.estado || "Recibido 🥖";
            const clase = claseBadgeEstado(estado);
            let productosHTML = "";
            if (Array.isArray(pedido.productos)) {
                pedido.productos.forEach((prod) => {
                    productosHTML += `<li>${prod.cantidad}x ${escapeHtml(prod.nombre)} - $${(prod.precio * prod.cantidad).toFixed(2)}</li>`;
                });
            }
            const card = document.createElement("div");
            card.className = "card-pedido-historial";
            card.innerHTML = `
                <div class="pedido-historial-header">
                    <span class="pedido-id">Ref: ${escapeHtml(pedido.codigoPedido || "#WEB-XXXX")}</span>
                    <span class="pedido-fecha">${pedido.fechaCreacion ? new Date(pedido.fechaCreacion).toLocaleDateString() : "Reciente"}</span>
                </div>
                <ul class="pedido-productos-list pedido-productos-list-compact">${productosHTML}</ul>
                <div class="pedido-historial-footer">
                    <div><strong>Total: ${escapeHtml(String(pedido.total))}</strong></div>
                    <span class="badge-estado ${clase}">${escapeHtml(estado)}</span>
                </div>
            `;
            contenedorHistorial.appendChild(card);
        });
    } catch (error) {
        console.error(error);
        document.getElementById("contenedorHistorialPedidos").innerHTML =
            '<p class="text-muted">Error al cargar el historial. Intenta más tarde.</p>';
    }
}

function actualizarTarjetaLealtad() {
    const puntos = obtenerPuntos();
    const el = document.getElementById("perfPuntosLealtad");
    const bar = document.getElementById("perfBarraLealtad");
    const meta = 100;
    if (el) el.textContent = String(puntos);
    if (bar) bar.style.width = `${Math.min(100, (puntos % meta) / meta * 100)}%`;
}

function repetirUltimoPedido() {
    let ultimo;
    try { ultimo = JSON.parse(localStorage.getItem(ULTIMO_PEDIDO_KEY)); } catch { ultimo = null; }
    if (!ultimo?.productos?.length) {
        Swal.fire({ title: "Sin pedido previo", text: "Aún no tienes un pedido guardado para repetir.", icon: "info", confirmButtonColor: "#7b5533" });
        return;
    }
    ultimo.productos.forEach((item) => {
        const existente = carrito.find((c) => c.nombre === item.nombre);
        if (existente) existente.cantidad += item.cantidad || 1;
        else carrito.push({ ...item, cantidad: item.cantidad || 1 });
    });
    guardarCarritoEnStorage();
    actualidorContadorGlobal();
    actualizarCarritoVisual();
    document.dispatchEvent(new CustomEvent("carrito:actualizado", { detail: { carrito } }));
    openSide("cartSidebar");
    mostrarToast("Pedido anterior agregado al carrito");
}

function conmutarModoEdicionPerfil(activarFormulario) {
    const divLectura = document.getElementById("vistaLecturaPerfil");
    const divFormulario = document.getElementById("vistaFormularioPerfil");
    if (activarFormulario) {
        if (!idDocumentoUsuarioFirestore) {
            Swal.fire({ title: "Perfil Invitado 🥐", text: "Los usuarios de respaldo no pueden editar sus campos.", icon: "info", confirmButtonColor: "#7b5533" });
            return;
        }
        divLectura.style.display = "none";
        divFormulario.style.display = "block";
        divFormulario.classList.remove("perfil-formulario");
    } else {
        divLectura.style.display = "block";
        divFormulario.style.display = "none";
        divFormulario.classList.add("perfil-formulario");
    }
}

async function guardarDatosPerfilActualizados() {
    const nuevoNombre = document.getElementById("editPerfNombre").value.trim().toUpperCase();
    const nuevosApellidos = document.getElementById("editPerfApellidos").value.trim().toUpperCase();
    const nuevoTelefono = document.getElementById("editPerfTelefono").value.trim();
    const nuevaDireccion = document.getElementById("editPerfDireccion").value.trim();
    const nuevasNotas = document.getElementById("editPerfNotas")?.value.trim() || "";

    if (!nuevoNombre || !nuevosApellidos || !nuevoTelefono || !nuevaDireccion) {
        Swal.fire({ title: "Campos Vacíos ⚠️", text: "Nombre, apellidos, teléfono y dirección son obligatorios.", icon: "warning", confirmButtonColor: "#7b5533" });
        return;
    }

    try {
        await updateDoc(doc(db, "usuarios", idDocumentoUsuarioFirestore), {
            nombre: nuevoNombre, apellidos: nuevosApellidos, telefono: nuevoTelefono, direccion: nuevaDireccion, notas: nuevasNotas
        });
        usuarioLogueado = nuevoNombre;
        actualizarInterfazUsuario();
        Swal.fire({ title: "¡Perfil Actualizado! 💾🥖", icon: "success", confirmButtonColor: "#7b5533" });
        conmutarModoEdicionPerfil(false);
        cargarPerfilUsuario();
    } catch (err) {
        console.error(err);
        Swal.fire({ title: "Error al Guardar ❌", icon: "error", confirmButtonColor: "#7b5533" });
    }
}

// --- Carrito ---
function aplicarCupon() {
    const codigo = document.getElementById("inputCupon").value.trim().toUpperCase();
    const cuponesValidos = { CONCHALOVER: 0.1, PRIMERCOMPRA: 20, HORNO20: 0.2 };

    if (cuponesValidos[codigo] === undefined) {
        Swal.fire("Cupón Inválido ❌", "El código ingresado no existe o no es válido.", "error");
        return;
    }
    cuponAplicado = codigo;
    const subtotal = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    descuentoActual = codigo === "PRIMERCOMPRA" ? Math.min(cuponesValidos[codigo], subtotal) : subtotal * cuponesValidos[codigo];
    actualizarCarritoVisual();
    mostrarToast(`¡Cupón ${codigo} aplicado con éxito!`);
}

function agregarAlCarrito(nombre, precio, img) {
    const card = [...document.querySelectorAll(".item-producto")].find(
        (el) => el.querySelector("h4")?.textContent === nombre
    );
    if (card?.dataset.disponible === "no") {
        mostrarToast("Este producto no está disponible por ahora.");
        return;
    }
    const precioNumerico = parseFloat(precio);
    const itemExistente = carrito.find((item) => item.nombre === nombre);
    if (itemExistente) itemExistente.cantidad += 1;
    else carrito.push({ nombre, precio: precioNumerico, img, cantidad: 1 });

    guardarCarritoEnStorage();
    actualidorContadorGlobal();
    actualizarCarritoVisual();
    document.dispatchEvent(new CustomEvent("carrito:actualizado", { detail: { carrito } }));
    mostrarToast(`¡${nombre} agregado a la bolsa! 🥐`);

    const badge = document.getElementById("cartCount");
    if (badge) {
        badge.classList.add("pop");
        setTimeout(() => badge.classList.remove("pop"), 300);
    }
}

function actualidorContadorGlobal() {
    const totalUnidades = carrito.reduce((a, item) => a + item.cantidad, 0);
    const badge = document.getElementById("cartCount");
    if (badge) badge.textContent = totalUnidades;

    const pill = document.getElementById("cartItemCount");
    if (pill) pill.textContent = totalUnidades === 1 ? "1 producto" : `${totalUnidades} productos`;

    const checkoutPanel = document.getElementById("cartCheckoutPanel");
    if (checkoutPanel) checkoutPanel.hidden = totalUnidades === 0;
}

function actualizarCarritoVisual() {
    const container = document.getElementById("cartItemsContainer");
    if (!container) return;

    actualidorContadorGlobal();

    if (carrito.length === 0) {
        container.innerHTML = `
            <div class="cart-empty-state">
                <i class="fa-solid fa-basket-shopping" aria-hidden="true"></i>
                <p>Tu carrito está vacío</p>
                <button type="button" class="btn-secundario">Ver catálogo</button>
            </div>`;
        container.querySelector(".btn-secundario")?.addEventListener("click", () => {
            closeSide("cartSidebar");
            scrollAlCatalogo();
        });
        actualizarResumenPrecios();
        return;
    }

    container.innerHTML = "";
    carrito.forEach((item, index) => {
        const subtotalItem = item.precio * item.cantidad;
        const row = document.createElement("article");
        row.className = "cart-item-card";
        row.innerHTML = `
            <img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.nombre)}" loading="lazy" width="72" height="72"
                 onerror="this.src='https://via.placeholder.com/72';">
            <div class="cart-item-body">
                <h4>${escapeHtml(item.nombre)}</h4>
                <p class="cart-item-precio">$${item.precio.toFixed(2)} <span>c/u</span></p>
                <div class="cart-qty-controls">
                    <button type="button" class="btn-qty" data-index="${index}" data-delta="-1" aria-label="Quitar uno">−</button>
                    <span class="qty-value">${item.cantidad}</span>
                    <button type="button" class="btn-qty" data-index="${index}" data-delta="1" aria-label="Agregar uno">+</button>
                </div>
            </div>
            <p class="cart-item-subtotal">$${subtotalItem.toFixed(2)}</p>`;
        row.querySelectorAll(".btn-qty").forEach((btn) => {
            btn.addEventListener("click", () => cambiarCantidad(Number(btn.dataset.index), Number(btn.dataset.delta)));
        });
        container.appendChild(row);
    });

    actualizarResumenPrecios();
}

function cambiarCantidad(index, cambio) {
    carrito[index].cantidad += cambio;
    if (carrito[index].cantidad <= 0) carrito.splice(index, 1);
    guardarCarritoEnStorage();
    actualidorContadorGlobal();
    actualizarCarritoVisual();
    document.dispatchEvent(new CustomEvent("carrito:actualizado", { detail: { carrito } }));
}

function vaciarCarritoCompleto() {
    if (carrito.length === 0) return;
    Swal.fire({
        title: "¿Vaciar tu bolsa de pan? 🥖",
        text: "Esta acción removerá todos los artículos seleccionados.",
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#7b5533",
        cancelButtonColor: "#7c726a",
        confirmButtonText: "Sí, vaciar",
        cancelButtonText: "Mantener panes"
    }).then((result) => {
        if (!result.isConfirmed) return;
        carrito = [];
        cuponAplicado = null;
        descuentoActual = 0;
        guardarCarritoEnStorage();
        actualidorContadorGlobal();
        actualizarCarritoVisual();
        document.dispatchEvent(new CustomEvent("carrito:actualizado", { detail: { carrito } }));
        const inputFecha = document.getElementById("fechaEntrega");
        const selectHorario = document.getElementById("horarioEntrega");
        if (inputFecha) inputFecha.value = "";
        if (selectHorario) selectHorario.value = "";
        metodoEntrega = "tienda";
        document.querySelector('input[name="metodoEntrega"][value="tienda"]')?.click();
        const dir = document.getElementById("direccionEntregaPedido");
        if (dir) dir.value = "";
        mostrarToast("Se ha vaciado tu carrito de compras.");
    });
}

function guardarCarritoEnStorage() {
    localStorage.setItem(CARRITO_STORAGE_KEY, JSON.stringify(carrito));
    window.carritoActual = carrito;
}

function configurarRestriccionFechas() {
    const inputFecha = document.getElementById("fechaEntrega");
    if (!inputFecha) return;
    const hoy = new Date();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");
    inputFecha.setAttribute("min", `${hoy.getFullYear()}-${mm}-${dd}`);
}

async function finalizarCompraServidor() {
    if (carrito.length === 0) {
        Swal.fire({ title: "Bolsa vacía 🥖", text: "Agrega al menos un producto.", icon: "warning", confirmButtonColor: "#7b5533" });
        return;
    }

    const inputFecha = document.getElementById("fechaEntrega");
    const selectHorario = document.getElementById("horarioEntrega");
    const campoDir = document.getElementById("direccionEntregaPedido");
    if (!inputFecha || !selectHorario) return;

    inputFecha.classList.remove("error");
    selectHorario.classList.remove("error");
    campoDir?.classList.remove("error");

    if (metodoEntrega === "domicilio") {
        const direccion = await obtenerDireccionParaPedido();
        if (!direccion) {
            campoDir?.classList.add("error");
            Swal.fire({
                title: "Falta la dirección 📍",
                text: "Para envío a domicilio necesitamos tu dirección completa.",
                icon: "info",
                confirmButtonColor: "#7b5533"
            }).then(() => campoDir?.focus());
            return;
        }
    }

    if (!inputFecha.value) {
        inputFecha.classList.add("error");
        Swal.fire({ title: "Falta la Fecha 📅", icon: "info", confirmButtonColor: "#7b5533" }).then(() => inputFecha.focus());
        return;
    }
    if (!selectHorario.value) {
        selectHorario.classList.add("error");
        Swal.fire({ title: "Falta el Horario 🕒", icon: "info", confirmButtonColor: "#7b5533" }).then(() => selectHorario.focus());
        return;
    }

    const seleccionCero = new Date(inputFecha.value + "T00:00:00");
    const hoy = new Date();
    const hoyCero = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const selCero = new Date(seleccionCero.getFullYear(), seleccionCero.getMonth(), seleccionCero.getDate());

    if (selCero.getTime() === hoyCero.getTime() && hoy.getHours() >= 20) {
        inputFecha.classList.add("error");
        Swal.fire({ title: "Horno Apagado por Hoy 🥐💤", text: "Programa tu recogida para mañana.", icon: "error", confirmButtonColor: "#7b5533" });
        return;
    }
    if (selCero.getTime() < hoyCero.getTime()) {
        inputFecha.classList.add("error");
        Swal.fire({ title: "Fecha Inválida 📅❌", icon: "error", confirmButtonColor: "#7b5533" });
        return;
    }

    const btnCheckout = document.querySelector(".btn-checkout");
    const textoOriginalBtn = btnCheckout.innerHTML;
    btnCheckout.disabled = true;
    btnCheckout.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Registrando...';

    const stringPedido = `#WEB-${Math.floor(Date.now() / 100000)}`;
    const partesFecha = inputFecha.value.split("-");
    const fechaFormateada = `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}`;
    const resumen = calcularResumenCarrito();
    const totalTextoHtml = `$${resumen.total.toFixed(2)}`;
    const nombreParaMensaje = usuarioLogueado || "Cliente Invitado";
    const productosDetalleString = carrito.map((item) => `${item.nombre} (x${item.cantidad})`).join(", ");
    const esDomicilio = metodoEntrega === "domicilio";
    const direccionPedido = esDomicilio ? await obtenerDireccionParaPedido() : "Recoge en tienda — Zaragoza";
    const metodoTexto = esDomicilio ? `Envío a domicilio (+$${resumen.envio.toFixed(2)})` : "Recoger en tienda";

    try {
        await addDoc(collection(db, "pedidos"), {
            codigoPedido: stringPedido,
            cliente: nombreParaMensaje,
            uidCliente: auth.currentUser ? auth.currentUser.uid : "invitado",
            productos: carrito,
            total: totalTextoHtml,
            subtotal: resumen.subtotal,
            costoEnvio: resumen.envio,
            metodoEntrega: metodoTexto,
            direccionEntrega: direccionPedido,
            cuponUsado: cuponAplicado || "Ninguno",
            descuentoAplicado: descuentoActual,
            fechaRecoleccion: fechaFormateada,
            horarioRecoleccion: selectHorario.value,
            fechaCreacion: Date.now(),
            estado: "Recibido 🥖"
        });
    } catch (err) {
        console.error(err);
        Swal.fire({ title: "No se pudo registrar el pedido", text: "Revisa tu conexión e intenta de nuevo.", icon: "error", confirmButtonColor: "#7b5533" });
        btnCheckout.disabled = false;
        btnCheckout.innerHTML = textoOriginalBtn;
        return;
    }

    btnCheckout.disabled = false;
    btnCheckout.innerHTML = textoOriginalBtn;

    const mensajeWhatsApp = `¡Hola, ${nombreParaMensaje}! 👋 Pedido ${stringPedido}:

🍞 ${productosDetalleString}
📦 ${metodoTexto}
${esDomicilio ? `📍 ${direccionPedido}\n` : ""}💵 Total: ${totalTextoHtml}
📅 ${fechaFormateada} | 🕒 ${selectHorario.value}

¡Gracias por tu preferencia! ✨`;

    const unidadesPedido = carrito.reduce((s, i) => s + i.cantidad, 0);
    localStorage.setItem(ULTIMO_PEDIDO_KEY, JSON.stringify({ productos: [...carrito], fecha: Date.now() }));
    sumarPuntos(unidadesPedido);
    actualizarTarjetaLealtad();

    mostrarToast("🎉 ¡Pedido guardado! Redirigiendo a WhatsApp...");
    window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensajeWhatsApp)}`, "_blank");

    carrito = [];
    document.dispatchEvent(new CustomEvent("carrito:actualizado", { detail: { carrito } }));
    cuponAplicado = null;
    descuentoActual = 0;
    guardarCarritoEnStorage();
    inputFecha.value = "";
    selectHorario.value = "";
    actualidorContadorGlobal();
    actualizarCarritoVisual();
    closeSide("cartSidebar");
}

// --- Reseñas ---
function seleccionarEstrellasVoto(valor) {
    estrellasSeleccionadas = parseInt(valor, 10);
    document.querySelectorAll(".estrella-voto").forEach((est) => {
        const valEst = parseInt(est.dataset.valor, 10);
        est.classList.toggle("activa", valEst <= estrellasSeleccionadas);
        est.setAttribute("aria-pressed", valEst <= estrellasSeleccionadas ? "true" : "false");
    });
}

async function enviarReseña() {
    const input = document.getElementById("texto-reseña");
    const texto = input?.value.trim();
    if (!texto) return;

    try {
        await addDoc(collection(db, "resenas"), {
            texto,
            usuario: usuarioLogueado || "Cliente Invitado",
            calificacion: estrellasSeleccionadas,
            fecha: Date.now()
        });
        Swal.fire({ title: "¡Gracias por tu opinión! ✨", icon: "success", confirmButtonColor: "#7b5533" });
        input.value = "";
        seleccionarEstrellasVoto(5);
        cargarReseñas();
    } catch (error) {
        console.error(error);
        Swal.fire({ title: "Error de Conexión ❌", icon: "error", confirmButtonColor: "#7b5533" });
    }
}

async function cargarReseñas() {
    const divContenedor = document.getElementById("lista-reseñas");
    if (!divContenedor) return;
    divContenedor.innerHTML = "";

    try {
        const q = query(collection(db, "resenas"), orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            divContenedor.innerHTML = '<p class="empty-msg" style="grid-column:1/-1;text-align:center;">Sé el primero en dejar una opinión.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const datos = docSnap.data();
            const card = document.createElement("div");
            card.className = "reseña-card";
            const num = datos.calificacion || 5;
            let estrellasHTML = '<div class="stars-container">';
            for (let i = 1; i <= 5; i++) {
                estrellasHTML += i <= num
                    ? '<i class="fa-solid fa-star" aria-hidden="true"></i> '
                    : '<i class="fa-regular fa-star" style="color:#ddd" aria-hidden="true"></i> ';
            }
            estrellasHTML += "</div>";
            card.innerHTML = `${estrellasHTML}<p>"${escapeHtml(datos.texto)}"</p>
                <div class="reseña-user"><i class="fa-solid fa-circle-user" aria-hidden="true"></i><span>${escapeHtml(datos.usuario)}</span></div>`;
            divContenedor.appendChild(card);
        });
    } catch (error) {
        console.error(error);
    }
}

function configuracionEventosFormularios() {
    document.getElementById("formLogin")?.addEventListener("submit", handleLogin);
    document.getElementById("formRegister")?.addEventListener("submit", handleRegister);

    document.getElementById("inputBuscador")?.addEventListener("input", buscarProductos);

    document.querySelectorAll(".btn-categoria").forEach((btn) => {
        btn.addEventListener("click", () => filtrarCategoria(btn.dataset.categoria, btn));
    });

    document.querySelectorAll(".estrella-voto").forEach((est) => {
        est.addEventListener("click", () => seleccionarEstrellasVoto(est.dataset.valor));
    });

    document.getElementById("inputFotoPerfil")?.addEventListener("change", manejarFotoPerfil);
    document.getElementById("btnToggleQrRa")?.addEventListener("click", () => {
        const panel = document.getElementById("panelQrRa");
        const btn = document.getElementById("btnToggleQrRa");
        if (!panel || !btn) return;
        const abierto = panel.hidden;
        panel.hidden = !abierto;
        btn.setAttribute("aria-expanded", abierto ? "true" : "false");
    });

    document.getElementById("menuToggle")?.addEventListener("click", () => toggleMenuMovil());
    document.getElementById("navOverlay")?.addEventListener("click", cerrarMenuMovil);
    document.querySelectorAll("#navPrincipal a").forEach((a) => {
        a.addEventListener("click", cerrarMenuMovil);
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeSide("cartSidebar");
            closeSide("sideCuenta");
            closeAuth();
            cerrarMenuMovil();
        }
    });
}

function configurarToolbarCatalogo() {
    document.getElementById("toggleSoloDisponibles")?.addEventListener("change", (e) => {
        soloDisponibles = e.target.checked;
        aplicarFiltrosVisuales();
    });
    document.getElementById("toggleSoloFavoritos")?.addEventListener("change", (e) => {
        soloFavoritos = e.target.checked;
        aplicarFiltrosVisuales();
    });
    document.getElementById("selectOrdenCatalogo")?.addEventListener("change", (e) => {
        ordenCatalogo = e.target.value;
        renderizarCatalogo(catalogoActual);
    });
}

function arrancarApp() {
    console.log("Iniciando App Dulce Aroma...");
    migrarCarritoStorage();
    window.carritoActual = carrito;
    configuracionEventosFormularios();
    configurarToolbarCatalogo();
    configurarRestriccionFechas();
    configurarMetodoEntrega();
    actualizarCarritoVisual();
    seleccionarEstrellasVoto(5);
    inicializarCatalogo();
    cargarReseñas();
    iniciarExperiencia(() => catalogoActual);
    actualizarTarjetaLealtad();

    const modalAuth = document.getElementById("modalAuth");
    modalAuth?.addEventListener("click", (e) => { if (e.target === modalAuth) closeAuth(); });
    
    console.log("App Dulce Aroma: Lista para operar.");
}

// Inicializamos la app detectando el entorno
if (window.cordova !== undefined) {
    document.addEventListener("deviceready", arrancarApp, false);
} else {
    // Si no es móvil, arranca al cargar el HTML
    document.addEventListener("DOMContentLoaded", arrancarApp);
}

// --- Integración Nativa: Manejo del botón "Atrás" (Solo si es móvil) ---
if (window.cordova !== undefined) {
    document.addEventListener("deviceready", () => {
        document.addEventListener("backbutton", (e) => {
            const cart = document.getElementById("cartSidebar");
            const account = document.getElementById("sideCuenta");
            const auth = document.getElementById("modalAuth");

            if (cart?.classList.contains("active")) closeSide("cartSidebar");
            else if (account?.classList.contains("active")) closeSide("sideCuenta");
            else if (auth?.style.display === "flex") closeAuth();
        }, false);
    }, false);
}

Object.assign(window, {
    scrollAlCatalogo, enfocarBuscador, buscarProductos, openSide, closeSide,
    openAuth, closeAuth, switchTab, togglePasswordVisibility,
    cerrarSesionUsuario, agregarAlCarrito, cambiarCantidad, vaciarCarritoCompleto,
    finalizarCompraServidor, filtrarCategoria, seleccionarEstrellasVoto, enviarReseña,
    cargarReseñas, cargarPerfilUsuario, conmutarModoEdicionPerfil,
    guardarDatosPerfilActualizados, aplicarCupon, repetirUltimoPedido, mostrarToast
});

// --- Integración Nativa: Manejo del botón "Atrás" ---
document.addEventListener("deviceready", () => {
    document.addEventListener("bac	kbutton", (e) => {
        const cart = document.getElementById("cartSidebar");
        const account = document.getElementById("sideCuenta");
        const auth = document.getElementById("modalAuth");

        if (cart?.classList.contains("active")) {
            closeSide("cartSidebar");
        } else if (account?.classList.contains("active")) {
            closeSide("sideCuenta");
        } else if (auth?.style.display === "flex") {
            closeAuth();
        } else {
            // Si no hay nada abierto, el sistema cierra la app por defecto
            console.log("Cerrando app...");
        }
    }, false);
}, false);

Object.assign(window, {
    scrollAlCatalogo, enfocarBuscador, buscarProductos, openSide, closeSide,
    openAuth, closeAuth, switchTab, togglePasswordVisibility,
    cerrarSesionUsuario, agregarAlCarrito, cambiarCantidad, vaciarCarritoCompleto,
    finalizarCompraServidor, filtrarCategoria, seleccionarEstrellasVoto, enviarReseña,
    cargarReseñas, cargarPerfilUsuario, conmutarModoEdicionPerfil,
    guardarDatosPerfilActualizados, aplicarCupon, repetirUltimoPedido, mostrarToast
});
