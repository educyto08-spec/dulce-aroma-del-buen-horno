// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Tus credenciales del proyecto
const firebaseConfig = {
  apiKey: "AIzaSyCummr4hK95UXm8OoYkSWOBhtDpngpzbwE",
  authDomain: "dulce-aroma-del-buen-hor-8480a.firebaseapp.com",
  databaseURL: "https://dulce-aroma-del-buen-hor-8480a-default-rtdb.firebaseio.com",
  projectId: "dulce-aroma-del-buen-hor-8480a",
  storageBucket: "dulce-aroma-del-buen-hor-8480a.firebasestorage.app",
  messagingSenderId: "397232001248",
  appId: "1:397232001248:web:b60abee05f6ed57af30085"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- ESTADO GLOBAL ---
let carrito = JSON.parse(localStorage.getItem('carrito_miga_gold')) || [];
let usuarioLogueado = null; // Se manejará dinámicamente con el observador de Firebase

// --- FUNCIÓN HELPER: TOAST EMERGENTE ---
function mostrarToast(mensaje) {
    const toastViejo = document.querySelector('.toast-notificacion');
    if (toastViejo) toastViejo.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notificacion';
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${mensaje}</span>`;
     
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 50);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// --- NAVEGACIÓN Y SCROLL ---
function scrollAlCatalogo() {
    const seccionCatalogo = document.getElementById('productos');
    if (seccionCatalogo) {
        seccionCatalogo.scrollIntoView({ behavior: 'smooth' });
    }
}

function enfocarBuscador() {
    const seccionCatalogo = document.getElementById('productos');
    const inputBusqueda = document.getElementById('inputBuscador');
    if (seccionCatalogo && inputBusqueda) {
        seccionCatalogo.scrollIntoView({ behavior: 'smooth' });
         
        const checkScrollEnd = () => {
            inputBusqueda.focus();
            window.removeEventListener('scrollend', checkScrollEnd);
        };
         
        if ('onscrollend' in window) {
            window.addEventListener('scrollend', checkScrollEnd);
        } else {
            setTimeout(() => inputBusqueda.focus(), 500);
        }
    }
}

// --- BUSCADOR INTERACTIVO ---
function buscarProductos() {
    const textoBuscado = document.getElementById("inputBuscador").value.toLowerCase();
    const productos = document.querySelectorAll(".item-producto");
     
    const botones = document.querySelectorAll(".btn-categoria");
    if(botones[0]) {
        botones.forEach(btn => btn.classList.remove("active"));
        botones[0].classList.add("active");
    }

    productos.forEach(producto => {
        const nombreProducto = producto.querySelector("h4").textContent.toLowerCase();
        if (nombreProducto.includes(textoBuscado)) {
            producto.style.display = "flex";
        } else {
            producto.style.display = "none";
        }
    });
}

// --- GESTIÓN DE PANELES LATERALES ---
function openSide(id) {
    const panel = document.getElementById(id);
    if (panel) panel.classList.add('active');
}

function closeSide(id) {
    const panel = document.getElementById(id);
    if (panel) panel.classList.remove('active');
}

// --- SISTEMA DE AUTENTICACIÓN (FIREBASE AUTH & FIRESTORE COOPERATIVOS) ---
function openAuth() {
    document.getElementById('modalAuth').style.display = 'flex';
}

function closeAuth() {
    document.getElementById('modalAuth').style.display = 'none';
}

function switchTab(type) {
    const loginForm = document.getElementById('formLogin');
    const registerForm = document.getElementById('formRegister');
    const btnLogin = document.getElementById('btnTabLogin');
    const btnRegister = document.getElementById('btnTabRegister');

    if (type === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        btnLogin.classList.add('active');
        btnRegister.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        btnRegister.classList.add('active');
        btnLogin.classList.remove('active');
    }
}

function togglePasswordVisibility(inputId, icon) {
    const passInput = document.getElementById(inputId);
    if (passInput.type === 'password') {
        passInput.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        passInput.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// 1. Manejo del Inicio de Sesión Real
async function handleLogin(event) {
    event.preventDefault();
    const correo = document.getElementById('loginCorreo').value.trim();
    const contrasena = document.getElementById('loginPassword').value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, correo, contrasena);
        closeAuth();
        // El observador onAuthStateChanged se encargará de actualizar la interfaz
        document.getElementById('formLogin').reset();
    } catch (error) {
        console.error("Error al iniciar sesión: ", error.code);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            alert("El correo o la contraseña son incorrectos.");
        } else {
            alert("Error al iniciar sesión. Inténtalo de nuevo más tarde.");
        }
    }
}

// 2. Manejo del Registro Real de Usuarios (Auth + Firestore Perfil)
async function handleRegister(event) {
    event.preventDefault();
    const nombre = document.getElementById('regNombre').value.trim().toUpperCase();
    const apellidos = document.getElementById('regApellidos').value.trim().toUpperCase();
    const correo = document.getElementById('regCorreo').value.trim();
    const telefono = document.getElementById('regTelefono').value.trim();
    const contrasena = document.getElementById('regPassword').value;
    const direccion = document.getElementById('regDireccion').value.trim();

    try {
        // Crear usuario en Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, correo, contrasena);
        const user = userCredential.user;

        // Guardar datos extendidos del perfil en Firestore
        await addDoc(collection(db, "usuarios"), {
            uid: user.uid,
            nombre: nombre,
            apellidos: apellidos,
            correo: correo,
            telefono: telefono,
            direccion: direccion,
            fechaRegistro: Date.now()
        });

        closeAuth();
        alert(`¡Cuenta creada con éxito!\nBienvenido a Dulce Aroma del Buen Horno, ${nombre}.`);
        document.getElementById('formRegister').reset();
    } catch (error) {
        console.error("Error al registrar usuario: ", error.code);
        if (error.code === 'auth/email-already-in-use') {
            alert("Este correo electrónico ya se encuentra registrado.");
        } else if (error.code === 'auth/weak-password') {
            alert("La contraseña debe tener al menos 6 caracteres.");
        } else {
            alert("No se pudo crear la cuenta. Inténtalo de nuevo.");
        }
    }
}

// 3. Cierre de Sesión Real
async function cerrarSesion() {
    try {
        await signOut(auth);
        mostrarToast("Has cerrado sesión.");
    } catch (error) {
        console.error("Error al cerrar sesión: ", error);
    }
}

// 4. Observador de Estado de Autenticación Activo
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Buscar el perfil extendido en la colección usuarios usando el UID
        try {
            const querySnapshot = await getDocs(collection(db, "usuarios"));
            let nombreMostrar = user.email.split('@')[0].toUpperCase(); // Respaldo por defecto
            
            querySnapshot.forEach((doc) => {
                const ud = doc.data();
                if (ud.uid === user.uid) {
                    nombreMostrar = ud.nombre;
                }
            });

            usuarioLogueado = nombreMostrar;
        } catch (e) {
            usuarioLogueado = user.email.split('@')[0].toUpperCase();
        }
    } else {
        usuarioLogueado = null;
    }
    actualizarInterfazUsuario();
});

function actualizarInterfazUsuario() {
    const container = document.getElementById('userSessionContainer');
    if (container) {
        if (usuarioLogueado) {
            container.innerHTML = `
                <span style="color: #631919; font-weight: bold; font-size: 0.8rem; margin-right: 10px;">
                    HOLA, ${usuarioLogueado}
                </span>
                <a href="javascript:void(0)" onclick="cerrarSesion()" class="icon-link" style="color: #c93b3b; font-size: 0.8rem; font-weight: bold; text-decoration: none;">SALIR</a>
            `;
        } else {
            container.innerHTML = `
                <a href="javascript:void(0)" onclick="openAuth()" class="icon-link" style="font-size: 0.8rem; font-weight: bold; text-decoration: none;">INICIAR SESIÓN</a>
            `;
        }
    }
}

// --- LÓGICA DEL CARRITO ---
function agregarAlCarrito(nombre, precio, img) {
    const precioNumerico = parseFloat(precio);
    const itemExistente = carrito.find(item => item.nombre === nombre);
     
    if (itemExistente) {
        itemExistente.cantidad += 1;
    } else {
        carrito.push({ nombre, precio: precioNumerico, img, cantidad: 1 });
    }
     
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
    const totalUnidades = carrito.reduce((acumulador, item) => acumulador + item.cantidad, 0);
    const badge = document.getElementById("cartCount");
    if (badge) badge.textContent = totalUnidades;
     
    const bloqueLogistica = document.getElementById("bloqueLogisticaCart");
    if (bloqueLogistica) {
        if (totalUnidades > 0) {
            bloqueLogistica.classList.add("active");
        } else {
            bloqueLogistica.classList.remove("active");
        }
    }
}

function actualizarCarritoVisual() {
    const container = document.getElementById("cartItemsContainer");
    const totalText = document.getElementById("cartTotalText");
    if (!container || !totalText) return;

    container.innerHTML = "";
    let totalPrecioAcumulado = 0;

    if (carrito.length === 0) {
        container.innerHTML = '<p class="empty-msg">Tu carrito está vacío</p>';
    } else {
        carrito.forEach((item, index) => {
            const subtotalItem = item.precio * item.cantidad;
            totalPrecioAcumulado += subtotalItem;
             
            container.innerHTML += `
                <div class="cart-item-row">
                    <img src="${item.img}" onerror="this.src='https://via.placeholder.com/65';">
                    <div class="cart-item-info">
                        <h4>${item.nombre}</h4>
                        <p>$${subtotalItem.toFixed(2)}</p>
                        <div class="cart-qty-controls">
                            <button onclick="cambiarCantidad(${index}, -1)" class="btn-qty">-</button>
                            <span class="qty-value">${item.cantidad}</span>
                            <button onclick="cambiarCantidad(${index}, 1)" class="btn-qty">+</button>
                        </div>
                    </div>
                </div>`;
        });
    }
    totalText.textContent = `$${totalPrecioAcumulado.toFixed(2)}`;
}

function cambiarCantidad(index, cambio) {
    carrito[index].cantidad += cambio;
     
    if (carrito[index].cantidad <= 0) {
        carrito.splice(index, 1);
    }
     
    guardarCarritoEnStorage();
    actualidorContadorGlobal();
    actualizarCarritoVisual();
}

function vaciarCarritoCompleto() {
    if (carrito.length === 0) return;
     
    if (confirm("¿Estás seguro de que deseas remover todos los artículos de tu bolsa?")) {
        carrito = [];
        guardarCarritoEnStorage();
        actualidorContadorGlobal();
        actualizarCarritoVisual();
         
        const inputFecha = document.getElementById("fechaEntrega");
        const selectHorario = document.getElementById("horarioEntrega");
        if (inputFecha) inputFecha.value = "";
        if (selectHorario) selectHorario.value = "";
         
        mostrarToast("Se ha vaciado tu carrito de compras.");
    }
}

function guardarCarritoEnStorage() {
    localStorage.setItem('carrito_miga_gold', JSON.stringify(carrito));
}

function configurarRestriccionFechas() {
    const inputFecha = document.getElementById("fechaEntrega");
    if (inputFecha) {
        const hoy = new Date();
        const yyyy = hoy.getFullYear();
        let mm = hoy.getMonth() + 1; 
        let dd = hoy.getDate();

        if (mm < 10) mm = '0' + mm;
        if (dd < 10) dd = '0' + dd;

        const fechaMinima = yyyy + '-' + mm + '-' + dd;
        inputFecha.setAttribute("min", fechaMinima);
    }
}

// --- SUBIR COMPRA A FIRESTORE Y REDIRIGIR A WHATSAPP ---
async function finalizarCompraServidor() {
    if (carrito.length === 0) {
        alert("El carrito está vacío.");
        return;
    }
     
    const inputFecha = document.getElementById("fechaEntrega");
    const selectHorario = document.getElementById("horarioEntrega");
     
    if (!inputFecha || !selectHorario) return;
     
    inputFecha.classList.remove("error");
    selectHorario.classList.remove("error");
     
    if (!inputFecha.value) {
        inputFecha.classList.add("error");
        alert("Por favor, selecciona la fecha para recoger tu pan.");
        inputFecha.focus();
        return;
    }
     
    if (!selectHorario.value) {
        selectHorario.classList.add("error");
        alert("Por favor, selecciona un rango de horario conveniente.");
        selectHorario.focus();
        return;
    }

    const idAleatorio = Math.floor(Date.now() / 100000);
    const stringPedido = `#WEB-${idAleatorio}`;

    const productosDetalleString = carrito.map(item => `${item.nombre} (x${item.cantidad})`).join(", ");
    const partesFecha = inputFecha.value.split("-");
    const fechaFormateada = `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}`;
    const totalTextoHtml = document.getElementById("cartTotalText").textContent;
    let nombreParaMensaje = usuarioLogueado ? usuarioLogueado : "Cliente Invitado";

    // GUARDAR EN CLOUD FIRESTORE EL PEDIDO PARA EL ADMINISTRADOR antes de ir a WhatsApp
    try {
        await addDoc(collection(db, "pedidos"), {
            codigoPedido: stringPedido,
            cliente: nombreParaMensaje,
            uidCliente: auth.currentUser ? auth.currentUser.uid : "invitado",
            productos: carrito,
            total: totalTextoHtml,
            fechaRecoleccion: fechaFormateada,
            horarioRecoleccion: selectHorario.value,
            fechaCreacion: Date.now()
        });
    } catch(err) {
        console.error("Error al registrar respaldo del pedido en Firestore: ", err);
    }
     
    const mensajeWhatsApp = `¡Hola, ${nombreParaMensaje}! 👋 Confirmamos que tu pedido en la web ${stringPedido} se ha registrado con éxito. Aquí tienes los detalles:

🍦 Detalle: ${productosDetalleString}
💵 Total a pagar: ${totalTextoHtml}
📍 Método de entrega: Recoger en Tienda
📅 Fecha programada: ${fechaFormateada}
🕒 Horario de recolección: ${selectHorario.value}

¡Te esperamos! Que tengas un excelente día. ✨`;
     
    const urlWa = `https://wa.me/529223773794?text=${encodeURIComponent(mensajeWhatsApp)}`;
     
    mostrarToast("🎉 ¡Pedido guardado! Redirigiendo a WhatsApp...");
    window.open(urlWa, '_blank');

    // Resetear Carrito
    carrito = [];
    guardarCarritoEnStorage();
    inputFecha.value = "";
    selectHorario.value = "";
    actualidorContadorGlobal();
    actualizarCarritoVisual();
    closeSide('cartSidebar');
}

// --- FILTRADO DE CATEGORÍAS ---
function filtrarCategoria(categoria, e) {
    document.getElementById("inputBuscador").value = "";
    const botones = document.querySelectorAll(".btn-categoria");
    botones.forEach(btn => btn.classList.remove("active"));
     
    if (e && e.currentTarget) {
        e.currentTarget.classList.add("active");
    }

    const productos = document.querySelectorAll(".item-producto");
    productos.forEach(producto => {
        if (categoria === "todos") {
            producto.style.display = "flex";
        } else {
            if (producto.dataset.categoria === categoria) {
                producto.style.display = "flex";
            } else {
                producto.style.display = "none";
            }
        }
    });
}

// --- GESTIÓN DE RESEÑAS CON CLOUD FIRESTORE REAL ---
async function enviarReseña() {
    const input = document.getElementById("texto-reseña");
    if (!input) return;

    const texto = input.value.trim();
    if (texto === "") return;

    const nombreUsuario = usuarioLogueado ? usuarioLogueado : "Cliente Invitado";

    try {
        await addDoc(collection(db, "reseñas"), {
            texto: texto,
            usuario: nombreUsuario,
            fecha: Date.now()
        });

        mostrarToast("✨ ¡Tu opinión ha sido guardada de forma permanente!");
        input.value = "";
        cargarReseñas();
    } catch (error) {
        console.error("Error al guardar en Firebase: ", error);
        alert("No se pudo conectar con el servidor para guardar tu opinión.");
    }
}

async function cargarReseñas() {
    const divContenedor = document.getElementById("lista-reseñas");
    if (!divContenedor) return;

    divContenedor.innerHTML = ""; 

    try {
        const q = query(collection(db, "reseñas"), orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            divContenedor.innerHTML = '<p class="empty-msg" style="grid-column: 1/-1; text-align: center;">Sé el primero en dejar una opinión sobre nuestro pan artesanal.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const datos = doc.data();
            
            const card = document.createElement("div");
            card.className = "reseña-card";

            const p = document.createElement("p");
            p.textContent = `"${datos.texto}"`;

            const userDiv = document.createElement("div");
            userDiv.className = "reseña-user";
            userDiv.innerHTML = '<i class="fa-solid fa-circle-user"></i>';

            const span = document.createElement("span");
            span.textContent = datos.usuario;

            userDiv.appendChild(span);
            card.appendChild(p);
            card.appendChild(userDiv);
             
            divContenedor.appendChild(card);
        });
    } catch (error) {
        console.error("Error al leer de Firebase: ", error);
    }
}

window.onload = () => {
    configuracionEventosFormularios();
    configurarRestriccionFechas();
    actualidorContadorGlobal();
    actualizarCarritoVisual();
    cargarReseñas();
};

window.onclick = (event) => {
    const modalAuth = document.getElementById("modalAuth");
    if (event.target == modalAuth) closeAuth();
};

function configuracionEventosFormularios() {
    const fLogin = document.getElementById('formLogin');
    const fRegister = document.getElementById('formRegister');
    if(fLogin) fLogin.addEventListener('submit', handleLogin);
    if(fRegister) fRegister.addEventListener('submit', handleRegister);
}

// --- EXPONER FUNCIONES AL ÁMBITO GLOBAL ---
window.scrollAlCatalogo = scrollAlCatalogo;
window.enfocarBuscador = enfocarBuscador;
window.buscarProductos = buscarProductos;
window.openSide = openSide;
window.closeSide = closeSide;
window.openAuth = openAuth;
window.closeAuth = closeAuth;
window.switchTab = switchTab;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.cerrarSesion = cerrarSesion;
window.agregarAlCarrito = agregarAlCarrito;
window.cambiarCantidad = cambiarCantidad;
window.vaciarCarritoCompleto = vaciarCarritoCompleto;
window.finalizarCompraServidor = finalizarCompraServidor;
window.filtrarCategoria = filtrarCategoria;
window.enviarReseña = enviarReseña;
window.cargarReseñas = cargarReseñas;
