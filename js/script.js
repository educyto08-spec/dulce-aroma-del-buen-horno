// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    orderBy,
    where,
    doc,
    updateDoc
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
let usuarioLogueado = null; 
let correoUsuarioLogueado = null; 
let estrellasSeleccionadas = 5; 
let idDocumentoUsuarioFirestore = null; // Guardará el ID interno del registro para poder editarlo

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
    if (panel) {
        panel.classList.add('active');
        if (id === 'sideCuenta') {
            conmutarModoEdicionPerfil(false); // Abrir siempre en modo lectura normal
            cargarPerfilUsuario();
        }
    }
}

function closeSide(id) {
    const panel = document.getElementById(id);
    if (panel) panel.classList.remove('active');
}

// --- SISTEMA DE AUTENTICACIÓN ---
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

async function handleLogin(event) {
    event.preventDefault();
    const correo = document.getElementById('loginCorreo').value.trim();
    const contrasena = document.getElementById('loginPassword').value;

    const btnSubmit = event.target.querySelector('.btn-submit-auth');
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verificando...`;

    try {
        await signInWithEmailAndPassword(auth, correo, contrasena);
        closeAuth();
        document.getElementById('formLogin').reset();
        
        Swal.fire({
            title: '¡Bienvenido de vuelta! 🥐',
            text: 'Tu sesión ha iniciado correctamente.',
            icon: 'success',
            confirmButtonColor: '#7a283c',
            timer: 2000,
            timerProgressBar: true
        });
    } catch (error) {
        console.error("Error al iniciar sesión: ", error.code);
        let mensajeError = "Error al iniciar sesión. Inténtalo de nuevo más tarde.";
        
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            mensajeError = "El correo o la contraseña que ingresaste son incorrectos.";
        }
        
        Swal.fire({
            title: '¡Oh no! 🥖',
            text: mensajeError,
            icon: 'error',
            confirmButtonColor: '#7a283c'
        });
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = textoOriginal;
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const nombre = document.getElementById('regNombre').value.trim().toUpperCase();
    const apellidos = document.getElementById('regApellidos').value.trim().toUpperCase();
    const correo = document.getElementById('regCorreo').value.trim();
    const telefono = document.getElementById('regTelefono').value.trim();
    const contrasena = document.getElementById('regPassword').value;
    const direccion = document.getElementById('regDireccion').value.trim();

    const btnSubmit = event.target.querySelector('.btn-submit-auth');
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Horneando cuenta...`;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, correo, contrasena);
        const user = userCredential.user;

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
        document.getElementById('formRegister').reset();

        Swal.fire({
            title: `¡Excelente, ${nombre}! 🎉`,
            text: 'Tu cuenta ha sido creada con éxito. Ya puedes disfrutar de nuestra panadería.',
            icon: 'success',
            confirmButtonColor: '#7a283c'
        });
    } catch (error) {
        console.error("Error al registrar usuario: ", error.code);
        let mensajeError = "No se pudo crear la cuenta. Inténtalo de nuevo.";
        
        if (error.code === 'auth/email-already-in-use') {
            mensajeError = "Este correo electrónico ya se encuentra registrado por otro cliente.";
        } else if (error.code === 'auth/weak-password') {
            mensajeError = "La contraseña es muy débil. Debe tener al menos 6 caracteres.";
        }

        Swal.fire({
            title: 'Error de Registro ❌',
            text: mensajeError,
            icon: 'warning',
            confirmButtonColor: '#7a283c'
        });
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = textoOriginal;
    }
}

async function cerrarSesionUsuario() {
    try {
        await signOut(auth);
        closeSide('sideCuenta');
        mostrarToast("Has cerrado sesión.");
    } catch (error) {
        console.error("Error al cerrar sesión: ", error);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        correoUsuarioLogueado = user.email;
        try {
            const querySnapshot = await getDocs(collection(db, "usuarios"));
            let nombreMostrar = user.email.split('@')[0].toUpperCase(); 
            
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
        correoUsuarioLogueado = null;
        idDocumentoUsuarioFirestore = null;
    }
    actualizarInterfazUsuario();
});

function actualizarInterfazUsuario() {
    const container = document.getElementById('userSessionContainer');
    if (container) {
        if (usuarioLogueado) {
            container.innerHTML = `
                <span onclick="openSide('sideCuenta')" style="color: #631919; font-weight: bold; font-size: 0.8rem; margin-right: 10px; cursor: pointer; text-decoration: underline;">
                    HOLA, ${usuarioLogueado}
                </span>
                <a href="javascript:void(0)" onclick="cerrarSesionUsuario()" class="icon-link" style="color: #c93b3b; font-size: 0.8rem; font-weight: bold; text-decoration: none;">SALIR</a>
            `;
        } else {
            container.innerHTML = `
                <a href="javascript:void(0)" onclick="openAuth()" class="icon-link" style="font-size: 0.8rem; font-weight: bold; text-decoration: none;"><i class="fa-regular fa-user"></i> INICIAR SESIÓN</a>
            `;
        }
    }
}

// --- CARGAR DATOS DE PERFIL E HISTORIAL DESDE FIRESTORE ---
async function cargarPerfilUsuario() {
    const user = auth.currentUser;
    if (!user) return;

    document.getElementById('perfCorreo').innerText = user.email;

    try {
        const qUsuarios = query(collection(db, "usuarios"), where("uid", "==", user.uid));
        const userSnapshot = await getDocs(qUsuarios);
        
        if (!userSnapshot.empty) {
            userSnapshot.forEach((docSnap) => {
                idDocumentoUsuarioFirestore = docSnap.id; // Almacenamos el ID de referencia del doc para hacer updates
                const ud = docSnap.data();
                
                // Rellenar etiquetas de texto de lectura
                document.getElementById('perfNombre').innerText = `${ud.nombre} ${ud.apellidos}`;
                document.getElementById('perfTelefono').innerText = ud.telefono || "No registrado";
                document.getElementById('perfDireccion').innerText = ud.direccion || "No registrada";
                
                // Rellenar de antemano el formulario de edición oculta
                document.getElementById('editPerfNombre').value = ud.nombre || "";
                document.getElementById('editPerfApellidos').value = ud.apellidos || "";
                document.getElementById('editPerfTelefono').value = ud.telefono || "";
                document.getElementById('editPerfDireccion').value = ud.direccion || "";
            });
        } else {
            document.getElementById('perfNombre').innerText = user.email.split('@')[0].toUpperCase();
            document.getElementById('perfTelefono').innerText = "No registrado";
            document.getElementById('perfDireccion').innerText = "No registrada";
            idDocumentoUsuarioFirestore = null;
        }

        const contenedorHistorial = document.getElementById('contenedorHistorialPedidos');
        contenedorHistorial.innerHTML = '<p class="text-muted">🔄 Consultando historial en la nube...</p>';

        const qPedidos = query(
            collection(db, "pedidos"),
            where("uidCliente", "==", user.uid),
            orderBy("fechaCreacion", "desc")
        );
        
        const pedidosSnapshot = await getDocs(qPedidos);

        if (pedidosSnapshot.empty) {
            contenedorHistorial.innerHTML = '<p class="text-muted">Aún no has realizado pedidos en nuestra web. ¡Tu pancito te espera! 🥐</p>';
            return;
        }

        contenedorHistorial.innerHTML = ""; 

        pedidosSnapshot.forEach((doc) => {
            const pedido = doc.data();
            const cardPedido = document.createElement('div');
            cardPedido.className = 'card-pedido-historial';

            let productosHTML = "";
            if (Array.isArray(pedido.productos)) {
                pedido.productos.forEach(prod => {
                    productosHTML += `<li>${prod.cantidad}x ${prod.nombre} - $${(prod.precio * prod.cantidad).toFixed(2)}</li>`;
                });
            }

            const fechaFormateada = pedido.fechaCreacion ? new Date(pedido.fechaCreacion).toLocaleDateString() : 'Reciente';

            cardPedido.innerHTML = `
                <div class="pedido-historial-header">
                    <span class="pedido-id">Ref: ${pedido.codigoPedido || '#WEB-XXXX'}</span>
                    <span class="pedido-fecha">${fechaFormateada}</span>
                </div>
                <ul class="pedido-productos-list" style="margin: 8px 0; padding-left: 20px; font-size: 0.85rem; color: #555;">
                    ${productosHTML}
                </ul>
                <div class="pedido-historial-footer" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; border-top: 1px solid #f5f5f5; padding-top: 6px; margin-top: 6px;">
                    <div><strong>Total: ${pedido.total}</strong></div>
                    <span class="badge-estado" style="background: #e1f5fe; color: #0288d1; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">Recibido 🥖</span>
                </div>
            `;
            contenedorHistorial.appendChild(cardPedido);
        });

    } catch (error) {
        console.error("Error al cargar datos del perfil e historial: ", error);
        const contenedorHistorial = document.getElementById('contenedorHistorialPedidos');
        if (contenedorHistorial) {
            contenedorHistorial.innerHTML = '<p class="text-danger">Error al conectar con la base de datos de historial.</p>';
        }
    }
}

// --- LÓGICA DE INTERFAZ EDITAR PERFIL ---
function conmutarModoEdicionPerfil(activarFormulario) {
    const divLectura = document.getElementById('vistaLecturaPerfil');
    const divFormulario = document.getElementById('vistaFormularioPerfil');
    
    if (activarFormulario) {
        // Validar que tengamos un ID del cliente en Firestore antes de permitir editar
        if(!idDocumentoUsuarioFirestore) {
            Swal.fire({
                title: 'Perfil Invitado 🥐',
                text: 'Los usuarios de respaldo predeterminados no pueden editar sus campos.',
                icon: 'info',
                confirmButtonColor: '#7a283c'
            });
            return;
        }
        divLectura.style.display = 'none';
        divFormulario.style.display = 'block';
    } else {
        divLectura.style.display = 'block';
        divFormulario.style.display = 'none';
    }
}

async function guardarDatosPerfilActualizados() {
    const nuevoNombre = document.getElementById('editPerfNombre').value.trim().toUpperCase();
    const nuevosApellidos = document.getElementById('editPerfApellidos').value.trim().toUpperCase();
    const nuevoTelefono = document.getElementById('editPerfTelefono').value.trim();
    const nuevaDireccion = document.getElementById('editPerfDireccion').value.trim();

    if (!nuevoNombre || !nuevosApellidos || !nuevoTelefono || !nuevaDireccion) {
        Swal.fire({
            title: 'Campos Vacíos ⚠️',
            text: 'Todos los campos de tu dirección y contacto son obligatorios.',
            icon: 'warning',
            confirmButtonColor: '#7a283c'
        });
        return;
    }

    try {
        // Instanciar referencia directa al documento del usuario usando su ID guardado
        const usuarioRef = doc(db, "usuarios", idDocumentoUsuarioFirestore);
        
        // Ejecutar actualización parcial en la nube
        await updateDoc(usuarioRef, {
            nombre: nuevoNombre,
            apellidos: nuevosApellidos,
            telefono: nuevoTelefono,
            direccion: nuevaDireccion
        });

        // Actualizar el estado global del usuario logueado en la cabecera
        usuarioLogueado = nuevoNombre;
        actualizarInterfazUsuario();

        Swal.fire({
            title: '¡Perfil Actualizado! 💾🥖',
            text: 'Tus datos de envío y contacto han sido guardados permanentemente.',
            icon: 'success',
            confirmButtonColor: '#7a283c'
        });

        // Apagar el formulario y volver a cargar los textos
        conmutarModoEdicionPerfil(false);
        cargarPerfilUsuario();
    } catch(err) {
        console.error("Error al actualizar perfil en Firestore: ", err);
        Swal.fire({
            title: 'Error al Guardar ❌',
            text: 'Ocurrió un problema de comunicación con el servidor. Inténtalo más tarde.',
            icon: 'error',
            confirmButtonColor: '#7a283c'
        });
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
     
    Swal.fire({
        title: '¿Vaciar tu bolsa de pan? 🥖',
        text: "Esta acción removerá todos los artículos que has seleccionado.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#7a283c',
        cancelButtonColor: '#7c726a',
        confirmButtonText: 'Sí, vaciar',
        cancelButtonText: 'Mantener panes'
    }).then((result) => {
        if (result.isConfirmed) {
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
    });
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
        Swal.fire({
            title: 'Bolsa vacía 🥖',
            text: 'Agrega al menos un pancito antes de finalizar tu compra.',
            icon: 'warning',
            confirmButtonColor: '#7a283c'
        });
        return;
    }
     
    const inputFecha = document.getElementById("fechaEntrega");
    const selectHorario = document.getElementById("horarioEntrega");
     
    if (!inputFecha || !selectHorario) return;
     
    inputFecha.classList.remove("error");
    selectHorario.classList.remove("error");
     
    if (!inputFecha.value) {
        inputFecha.classList.add("error");
        Swal.fire({
            title: 'Falta la Fecha 📅',
            text: 'Por favor, selecciona qué día pasarás a recoger tu pedido.',
            icon: 'info',
            confirmButtonColor: '#7a283c'
        }).then(() => inputFecha.focus());
        return;
    }
     
    if (!selectHorario.value) {
        selectHorario.classList.add("error");
        Swal.fire({
            title: 'Falta el Horario 🕒',
            text: 'Por favor, dinos en qué rango de horario te viene bien pasar.',
            icon: 'info',
            confirmButtonColor: '#7a283c'
        }).then(() => selectHorario.focus());
        return;
    }

    const fechaSeleccionada = new Date(inputFecha.value + 'T00:00:00');
    const hoy = new Date();
    
    const hoyCero = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const seleccionCero = new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), fechaSeleccionada.getDate());

    if (seleccionCero.getTime() === hoyCero.getTime()) {
        if (hoy.getHours() >= 20) {
            inputFecha.classList.add("error");
            Swal.fire({
                title: 'Horno Apagado por Hoy 🥐💤',
                text: 'Nuestra panadería cierra a las 8:00 PM. Por favor, programa tu recogida para el día de mañana.',
                icon: 'error',
                confirmButtonColor: '#7a283c'
            });
            return;
        }
    } else if (seleccionCero.getTime() < hoyCero.getTime()) {
        inputFecha.classList.add("error");
        Swal.fire({
            title: 'Fecha Inválida 📅❌',
            text: 'No es posible agendar una recogida para una fecha que ya pasó.',
            icon: 'error',
            confirmButtonColor: '#7a283c'
        });
        return;
    }

    const btnCheckout = document.querySelector('.btn-checkout');
    const textoOriginalBtn = btnCheckout.innerHTML;
    btnCheckout.disabled = true;
    btnCheckout.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registrando comanda...`;

    const idAleatorio = Math.floor(Date.now() / 100000);
    const stringPedido = `#WEB-${idAleatorio}`;

    const productosDetalleString = carrito.map(item => `${item.nombre} (x${item.cantidad})`).join(", ");
    const partesFecha = inputFecha.value.split("-");
    const fechaFormateada = `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}`;
    const totalTextoHtml = document.getElementById("cartTotalText").textContent;
    let nombreParaMensaje = usuarioLogueado ? usuarioLogueado : "Cliente Invitado";

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
    } finally {
        btnCheckout.disabled = false;
        btnCheckout.innerHTML = textoOriginalBtn;
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

// --- GESTIÓN DE RESEÑAS CON CLOUD FIRESTORE REAL Y ESTRELLAS INTERACTIVAS ---
function seleccionarEstrellasVoto(valor) {
    estrellasSeleccionadas = parseInt(valor);
    const estrellas = document.querySelectorAll(".estrella-voto");
    estrellas.forEach(est => {
        const valEst = parseInt(est.dataset.valor);
        if (valEst <= estrellasSeleccionadas) {
            est.style.color = "#f1c40f"; 
        } else {
            est.style.color = "#ddd"; 
        }
    });
}

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
            calificacion: estrellasSeleccionadas, 
            fecha: Date.now()
        });

        Swal.fire({
            title: '¡Gracias por tu opinión! ✨',
            text: 'Tu reseña y calificación han sido guardadas de forma permanente.',
            icon: 'success',
            confirmButtonColor: '#7a283c'
        });
        
        input.value = "";
        seleccionarEstrellasVoto(5); 
        cargarReseñas();
    } catch (error) {
        console.error("Error al guardar en Firebase: ", error);
        Swal.fire({
            title: 'Error de Conexión ❌',
            text: 'No se pudo conectar con el servidor para guardar tu opinión.',
            icon: 'error',
            confirmButtonColor: '#7a283c'
        });
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

            let estrellasHTML = '<div class="stars-container" style="color: #f1c40f; font-size: 0.9rem; margin-bottom: 6px;">';
            const numEstrellas = datos.calificacion || 5; 
            for (let i = 1; i <= 5; i++) {
                if (i <= numEstrellas) {
                    estrellasHTML += '<i class="fa-solid fa-star" style="margin-right:2px;"></i>';
                } else {
                    estrellasHTML += '<i class="fa-regular fa-star" style="color: #ddd; margin-right:2px;"></i>';
                }
            }
            estrellasHTML += '</div>';

            const p = document.createElement("p");
            p.textContent = `"${datos.texto}"`;

            const userDiv = document.createElement("div");
            userDiv.className = "reseña-user";
            userDiv.innerHTML = '<i class="fa-solid fa-circle-user"></i>';

            const span = document.createElement("span");
            span.textContent = datos.usuario;

            userDiv.appendChild(span);
            
            card.innerHTML = estrellasHTML;
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
    seleccionarEstrellasVoto(5); 
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
window.cerrarSesionUsuario = cerrarSesionUsuario;
window.agregarAlCarrito = agregarAlCarrito;
window.cambiarCantidad = cambiarCantidad;
window.vaciarCarritoCompleto = vaciarCarritoCompleto;
window.finalizarCompraServidor = finalizarCompraServidor;
window.filtrarCategoria = filtrarCategoria;
window.seleccionarEstrellasVoto = seleccionarEstrellasVoto;
window.enviarReseña = enviarReseña;
window.cargarReseñas = cargarReseñas;
window.cargarPerfilUsuario = cargarPerfilUsuario;
window.conmutarModoEdicionPerfil = conmutarModoEdicionPerfil;
window.guardarDatosPerfilActualizados = guardarDatosPerfilActualizados;
