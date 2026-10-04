(function () {
  let supabaseClient = null;
  let currentUser = null;
  let syncTimer = null;

  const STORAGE_KEY = "masAllaFinanzas";
  const NAME_KEY = "masAllaNombre";

  function $(id) {
    return document.getElementById(id);
  }

  function getLocalData() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function setStatus(message) {
    const el = $("syncStatus");
    if (el) el.textContent = message;
  }

  function createLoginBox() {
    const container = document.createElement("div");
    container.id = "loginSyncBox";

    container.innerHTML = `
      <div id="loginForm">
        <input
          id="syncName"
          type="text"
          placeholder="Tu nombre"
          autocomplete="given-name"
        >

        <input
          id="syncEmail"
          type="email"
          placeholder="Tu correo"
          autocomplete="email"
        >

        <button id="syncLoginButton" type="button">
          ENTRAR Y SINCRONIZAR
        </button>
      </div>

      <div id="loggedArea" style="display:none;">
        <span id="accountEmail"></span>
        <button id="syncLogoutButton" type="button">SALIR</button>
      </div>

      <small id="syncStatus">
        Tus datos están guardados en este dispositivo
      </small>
    `;

    const monthSelect = $("monthSelect");

    if (monthSelect && monthSelect.parentElement) {
      monthSelect.parentElement.appendChild(container);
    } else {
      document.body.prepend(container);
    }

    $("syncLoginButton").addEventListener("click", login);
    $("syncLogoutButton").addEventListener("click", logout);
  }

  function personalize(user) {
    const savedName =
      user?.user_metadata?.display_name ||
      localStorage.getItem(NAME_KEY);

    if (savedName) {
      const hello = document.querySelector(".hello");

      if (hello) {
        hello.textContent = `Hola ${savedName} ♡`;
      }
    }

    $("loginForm").style.display = "none";
    $("loggedArea").style.display = "flex";
    $("accountEmail").textContent = user.email || "";

    setStatus("✓ Cuenta conectada y sincronizada");
  }

  async function login() {
    const name = $("syncName").value.trim();
    const email = $("syncEmail").value.trim();

    if (!name || !email) {
      alert("Escribe tu nombre y tu correo 💗");
      return;
    }

    localStorage.setItem(NAME_KEY, name);

    setStatus("Enviando acceso a tu correo…");

    const { error } =
      await supabaseClient.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo:
            window.location.origin +
            window.location.pathname,
          data: {
            display_name: name
          }
        }
      });

    if (error) {
      console.error(error);
      setStatus("No pudimos enviar el acceso.");
      alert(
        "No pudimos enviarte el correo de acceso. Intenta nuevamente."
      );
      return;
    }

    setStatus("Revisa tu correo ✉️");

    alert(
      "Te enviamos un enlace para entrar a Versión Finanzas 💗"
    );
  }

  async function uploadData() {
    if (!currentUser) return;

    setStatus("Sincronizando…");

    const { error } =
      await supabaseClient
        .from("finance_profiles")
        .upsert(
          {
            user_id: currentUser.id,
            data: getLocalData(),
            updated_at: new Date().toISOString()
          },
          {
            onConflict: "user_id"
          }
        );

    if (error) {
      console.error(error);
      setStatus("No se pudo sincronizar");
      return;
    }

    setStatus("✓ Sincronizado");
  }

  async function downloadData() {
    if (!currentUser) return;

    setStatus("Cargando tu información…");

    const { data, error } =
      await supabaseClient
        .from("finance_profiles")
        .select("data")
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (error) {
      console.error(error);
      setStatus("No se pudo cargar tu información");
      return;
    }

    if (
      data &&
      data.data &&
      Object.keys(data.data).length > 0
    ) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data.data)
      );

      sessionStorage.setItem(
        "masAllaCloudLoaded",
        "1"
      );

      window.location.reload();
      return;
    }

    await uploadData();
  }

  function scheduleSync() {
    if (!currentUser) return;

    clearTimeout(syncTimer);

    syncTimer = setTimeout(() => {
      uploadData();
    }, 1200);
  }

  async function logout() {
    await supabaseClient.auth.signOut();

    sessionStorage.removeItem(
      "masAllaCloudLoaded"
    );

    window.location.reload();
  }

  async function initializeCloud() {
    createLoginBox();

    if (
      !window.supabase ||
      typeof SUPABASE_URL === "undefined" ||
      typeof SUPABASE_KEY === "undefined"
    ) {
      setStatus("Configuración de sincronización pendiente");
      return;
    }

    supabaseClient =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );

    const {
      data: { session }
    } =
      await supabaseClient.auth.getSession();

    currentUser = session?.user || null;

    if (currentUser) {
      personalize(currentUser);

      if (
        !sessionStorage.getItem(
          "masAllaCloudLoaded"
        )
      ) {
        await downloadData();
      }
    }

    supabaseClient.auth.onAuthStateChange(
      async (_event, session) => {
        currentUser = session?.user || null;

        if (currentUser) {
          personalize(currentUser);
        }
      }
    );

    document.addEventListener(
      "click",
      scheduleSync,
      true
    );

    document.addEventListener(
      "change",
      scheduleSync,
      true
    );

    setInterval(() => {
      if (currentUser) {
        uploadData();
      }
    }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeCloud
    );
  } else {
    initializeCloud();
  }
})();
