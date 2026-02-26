// Likes y dislikes locales
let likes = [];
let dislikes = [];

// Lista actual mostrada
let sportsList = [...initialSports];

// Contenedor
const container = document.getElementById("sportsContainer");

// Modal
const debugBtn = document.getElementById("debugBtn");
const debugModal = document.getElementById("debugModal");
const closeDebug = document.getElementById("closeDebug");
const debugBox = document.getElementById("debugMetrics");

// Abrir / cerrar modal (espera a que se carguen métricas)
debugBtn.onclick = async () => {
    debugModal.classList.remove("hidden");
    await loadMathMetrics();
};
closeDebug.onclick = () => debugModal.classList.add("hidden");

// Renderizar tarjetas
function renderSports(list) {
    list.forEach((sport) => {
        if (!sport.image) {
            sport.image = `/img/${sport.name}/img (${Math.floor(Math.random() * 10 + 1)}).webp`;
        }

        const card = document.createElement("div");
        card.className = "card";
        card.dataset.sport = sport.name;

        card.innerHTML = `
            <h2>${sport.name.replace(/_/g, " ")}</h2>
            <img src="${sport.image}" alt="${sport.name}" class="sport-img">
            <div class="metrics">
                <p class="proj"></p>
                <p class="score"></p>
            </div>
            <div>
                <button class="btn like">👍 Like</button>
                <button class="btn dislike">👎 Dislike</button>
            </div>
        `;

        setTimeout(() => card.classList.add("show"), 50);

        // Eventos Like / Dislike
        card.querySelector(".like").onclick = () => {
            if (!likes.includes(sport.name)) likes.push(sport.name);
            dislikes = dislikes.filter(d => d !== sport.name);
            card.style.background = "rgba(0,200,0,0.18)";
            sendFeedback();
            loadMathMetrics();
        };

        card.querySelector(".dislike").onclick = () => {
            if (!dislikes.includes(sport.name)) dislikes.push(sport.name);
            likes = likes.filter(l => l !== sport.name);
            card.style.background = "rgba(200,0,0,0.18)";
            sendFeedback();
            loadMathMetrics();
        };

        container.appendChild(card);
    });
}

// Render inicial
renderSports(sportsList);

// Enviar feedback al backend
async function sendFeedback() {
    try {
        await fetch("/save-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ like: likes, dislike: dislikes })
        });
        console.log("✅ Feedback enviado:", { like: likes, dislike: dislikes });
    } catch (e) {
        console.error("❌ Error sendFeedback:", e);
    }
}

// Obtener candidatos del backend
async function fetchCandidates() {
    console.log("📡 Fetching candidates...");

    const payload = {
        like: likes,
        dislike: dislikes,
        last_shown: sportsList.map(s => s.name)
    };

    console.log("📤 Sending payload:", payload);

    const res = await fetch("/get-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!res.ok) return null;

    const data = await res.json();
    console.log("📥 Raw response:", data);

    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.candidates)) return data.candidates;

    return null;
}

// Sampling ponderado
function sampleWeighted(candidates, k = 5, avoid_last = true) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    const scores = candidates.map(c =>
        typeof c.score === "number" ? Math.max(c.score, 0) : Math.random() * 0.01 + 0.005
    );

    const sum = scores.reduce((a, b) => a + b, 0);
    const probs = scores.map(s => s / (sum + 1e-12));

    const cum = [];
    probs.reduce((acc, p, i) => (cum[i] = acc + p, acc + p), 0);

    const chosen = [];

    for (let i = 0; i < k; i++) {
        let r = Math.random();
        let idx = cum.findIndex(c => c >= r);
        if (idx === -1) idx = candidates.length - 1;
        let name = candidates[idx].name;

        if (avoid_last) {
            const last = container.lastElementChild;
            if (last && last.dataset.sport === name) {
                for (let t = 0; t < 5; t++) {
                    r = Math.random();
                    idx = cum.findIndex(c => c >= r);
                    if (idx === -1) idx = candidates.length - 1;
                    name = candidates[idx].name;
                    if (name !== last.dataset.sport) break;
                }
            }
        }

        chosen.push(name);
    }

    return chosen.filter(Boolean);
}

// Cargar más deportes
async function loadMoreBySimilarity() {
    const candidates = await fetchCandidates();
    if (!candidates) return;

    const chosenNames = sampleWeighted(candidates, 5, true);
    if (!chosenNames.length) return;

    const newCards = chosenNames.map(name => ({
        name,
        image: `/img/${name}/img (${Math.floor(Math.random() * 10 + 1)}).webp`
    }));

    sportsList = sportsList.concat(newCards);
    renderSports(newCards);

    updateMathMetrics();
}

// Scroll infinito
let loading = false;
window.addEventListener("scroll", () => {
    if (loading) return;
    const cards = document.querySelectorAll(".card");
    if (cards.length < 2) return;
    const penultimate = cards[cards.length - 2];
    if (penultimate.getBoundingClientRect().top < window.innerHeight) {
        loading = true;
        loadMoreBySimilarity().finally(() => setTimeout(() => loading = false, 250));
    }
});

// Cargar métricas matemáticas y actualizar modal
async function loadMathMetrics() {
    const res = await fetch("/math-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ like: likes })
    });

    if (!res.ok) {
        debugBox.innerHTML = "<p>❌ Error cargando métricas</p>";
        return;
    }

    const data = await res.json();

    // Guardar proyección global
    window.user_projection = data.user_projection;

    debugBox.innerHTML = `
        <h3>Vector de gustos q</h3>
        <pre>${JSON.stringify(data.q, null, 2)}</pre>

        <h3>Autovalores</h3>
        <pre>${JSON.stringify(data.eigenvalues, null, 2)}</pre>

        <h3>Autovectores (V)</h3>
        <pre>${JSON.stringify(data.eigenvectors, null, 2)}</pre>

        <h3>Matriz diagonal D</h3>
        <pre>${JSON.stringify(data.D, null, 2)}</pre>

        <h3>Proyección q·v1 / ||v1||</h3>
        <pre>${data.user_projection.toFixed(6)}</pre>
    `;

    updateMathMetrics();
}

// Actualizar valores de proyección en tarjetas
function updateMathMetrics() {
    const cards = document.querySelectorAll(".card");
    cards.forEach(card => {
        const proj = card.querySelector(".proj");
    });
}
