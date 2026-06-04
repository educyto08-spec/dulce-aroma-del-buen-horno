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

const app = initializeApp(firebaseConfig);
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
function crearTarjetaProducto(p) {
    const nombre = escapeHtml(p.nombre);
    const desc = escapeHtml(p.descripcion);
    const img = escapeHtml(p.img);
    const cat = escapeHtml(p.categoria);
    const precio = Number(p.precio).toFixed(2);
    const badge = p.badge
        ? `<span class="badge-producto ${escapeHtml(p.badge.tipo)}">${escapeHtml(p.badge.texto)}</span>`
        : "";

    const articulo = document.createElement("article");
    articulo.className = "item-producto";
    articulo.dataset.categoria = cat;
    articulo.dataset.nombre = (p.nombre || "").toLowerCase();
    articulo.dataset.descripcion = (p.descripcion || "").toLowerCase();
    articulo.innerHTML = `
        <div class="img-wrapper">
            ${badge}
            <img src="${img}" alt="${nombre}" loading="lazy" decoding="async" width="260" height="180"
                 onerror="this.style.display='none';">
        </div>
        <h4>${nombre}</h4>
        <p class="descripcion">${desc}</p>
        <p class="precio">$${precio}</p>
        <button type="button" class="btn-pedir"><i class="fa-solid fa-plus" aria-hidden="true"></i> Agregar</button>
    `;
    articulo.querySelector(".btn-pedir").addEventListener("click", () => {
        agregarAlCarrito(p.nombre, Number(p.precio), p.img);
    });
    return articulo;
}

function renderizarCatalogo(lista) {
    const grid = document.getElementById("grid-productos");
    if (!grid) return;
    grid.innerHTML = "";
    lista.forEach((p) => grid.appendChild(crearTarjetaProducto(p)));
    aplicarFiltrosVisuales();
}

async function inicializarCatalogo() {
    const grid = document.getElementById("grid-productos");
    if (!grid) return;
    grid.innerHTML = '<p class="catalogo-cargando">Cargando catálogo...</p>';

    let productos = PRODUCTOS_CATALOGO;
    try {
        const snap = await getDocs(collection(db, "productos"));
        if (!snap.empty) {
            productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

        const mostrar = coincideCategoria && coincideTexto;
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
});

function actualizarInterfazUsuario() {
    const container = document.getElementById("userSessionContainer");
    if (!container) return;
    if (usuarioLogueado) {
        container.innerHTML = `
            <button type="button" class="btn-saludo-usuario" onclick="openSide('sideCuenta')">HOLA, ${escapeHtml(usuarioLogueado)}</button>
            <button type="button" class="icon-link btn-link-danger link-sesion-texto" onclick="cerrarSesionUsuario()">SALIR</button>
        `;
    } else {
        container.innerHTML = `
            <button type="button" onclick="openAuth()" class="icon-link link-sesion-texto" aria-label="Iniciar sesión">
                <i class="fa-regular fa-user" aria-hidden="true"></i> <span class="link-sesion-texto">INICIAR SESIÓN</span>
            </button>
        `;
    }
}

async function cargarPerfilUsuario() {
    const user = auth.currentUser;
    if (!user) return;
    document.getElementById("perfCorreo").innerText = user.email;

    try {
        const qUsuarios = query(collection(db, "usuarios"), where("uid", "==", user.uid));
        const userSnapshot = await getDocs(qUsuarios);

        if (!userSnapshot.empty) {
            userSnapshot.forEach((docSnap) => {
                idDocumentoUsuarioFirestore = docSnap.id;
                const ud = docSnap.data();
                document.getElementById("perfNombre").innerText = `${ud.nombre} ${ud.apellidos}`;
                document.getElementById("perfTelefono").innerText = ud.telefono || "No registrado";
                document.getElementById("perfDireccion").innerText = ud.direccion || "No registrada";
                document.getElementById("editPerfNombre").value = ud.nombre || "";
                document.getElementById("editPerfApellidos").value = ud.apellidos || "";
                document.getElementById("editPerfTelefono").value = ud.telefono || "";
                document.getElementById("editPerfDireccion").value = ud.direccion || "";
            });
        } else {
            document.getElementById("perfNombre").innerText = user.email.split("@")[0].toUpperCase();
            document.getElementById("perfTelefono").innerText = "No registrado";
            document.getElementById("perfDireccion").innerText = "No registrada";
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

    if (!nuevoNombre || !nuevosApellidos || !nuevoTelefono || !nuevaDireccion) {
        Swal.fire({ title: "Campos Vacíos ⚠️", text: "Todos los campos son obligatorios.", icon: "warning", confirmButtonColor: "#7b5533" });
        return;
    }

    try {
        await updateDoc(doc(db, "usuarios", idDocumentoUsuarioFirestore), {
            nombre: nuevoNombre, apellidos: nuevosApellidos, telefono: nuevoTelefono, direccion: nuevaDireccion
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
    const precioNumerico = parseFloat(precio);
    const itemExistente = carrito.find((item) => item.nombre === nombre);
    if (itemExistente) itemExistente.cantidad += 1;
    else carrito.push({ nombre, precio: precioNumerico, img, cantidad: 1 });

    guardarCarritoEnStorage();
    actualidorContadorGlobal();
    actualizarCarritoVisual();
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

    mostrarToast("🎉 ¡Pedido guardado! Redirigiendo a WhatsApp...");
    window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensajeWhatsApp)}`, "_blank");

    carrito = [];
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

function init() {
    migrarCarritoStorage();
    configuracionEventosFormularios();
    configurarRestriccionFechas();
    configurarMetodoEntrega();
    actualizarCarritoVisual();
    seleccionarEstrellasVoto(5);
    inicializarCatalogo();
    cargarReseñas();

    const modalAuth = document.getElementById("modalAuth");
    modalAuth?.addEventListener("click", (e) => { if (e.target === modalAuth) closeAuth(); });
}

init();

Object.assign(window, {
    scrollAlCatalogo, enfocarBuscador, buscarProductos, openSide, closeSide,
    openAuth, closeAuth, switchTab, togglePasswordVisibility,
    cerrarSesionUsuario, agregarAlCarrito, cambiarCantidad, vaciarCarritoCompleto,
    finalizarCompraServidor, filtrarCategoria, seleccionarEstrellasVoto, enviarReseña,
    cargarReseñas, cargarPerfilUsuario, conmutarModoEdicionPerfil,
    guardarDatosPerfilActualizados, aplicarCupon
});
