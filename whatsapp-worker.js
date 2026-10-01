const jsonHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
};

function jsonResponse(body, status, origin) {
    const headers = new Headers(jsonHeaders);

    if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
    }

    return new Response(JSON.stringify(body), { status, headers });
}

function getConfigurationError(env) {
    const required = [
        "ALLOWED_ORIGIN",
        "GRAPH_API_VERSION",
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_RECIPIENT",
        "WHATSAPP_TEMPLATE_NAME",
        "WHATSAPP_TEMPLATE_LANGUAGE"
    ];

    if (required.some((key) => !env[key])) {
        return "The WhatsApp notification service is not configured.";
    }

    try {
        const allowedOrigin = new URL(env.ALLOWED_ORIGIN);
        if (allowedOrigin.protocol !== "https:" || allowedOrigin.origin !== env.ALLOWED_ORIGIN) {
            return "The WhatsApp notification service is not configured.";
        }
    } catch {
        return "The WhatsApp notification service is not configured.";
    }

    if (!/^v\d+\.\d+$/.test(env.GRAPH_API_VERSION)) {
        return "The WhatsApp notification service is not configured.";
    }

    if (!/^\d{8,15}$/.test(env.WHATSAPP_RECIPIENT)) {
        return "The WhatsApp notification service is not configured.";
    }

    if (!/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID)) {
        return "The WhatsApp notification service is not configured.";
    }

    return null;
}

function validateSubmission(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return "Please check the form fields and try again.";
    }

    if (typeof payload.website !== "string" || payload.website.trim()) {
        return "Please check the form fields and try again.";
    }

    const fields = {
        name: [100, /^[\s\S]+$/],
        email: [254, /^[^\s@]+@[^\s@]+\.[^\s@]+$/],
        subject: [160, /^[\s\S]+$/],
        message: [1000, /^[\s\S]+$/]
    };

    for (const [name, [maxLength, pattern]] of Object.entries(fields)) {
        const value = payload[name];
        if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || !pattern.test(value.trim())) {
            return "Please check the form fields and try again.";
        }
    }

    return null;
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin");
        const configurationError = getConfigurationError(env);

        if (configurationError) {
            return jsonResponse({ ok: false, error: configurationError }, 503);
        }

        if (origin !== env.ALLOWED_ORIGIN) {
            return jsonResponse({ ok: false, error: "This origin is not allowed." }, 403);
        }

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Max-Age": "86400",
                    "Vary": "Origin"
                }
            });
        }

        if (request.method !== "POST") {
            return jsonResponse({ ok: false, error: "Method not allowed." }, 405, env.ALLOWED_ORIGIN);
        }

        if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
            return jsonResponse({ ok: false, error: "Expected a JSON request." }, 415, env.ALLOWED_ORIGIN);
        }

        const body = await request.text();
        if (new TextEncoder().encode(body).byteLength > 8192) {
            return jsonResponse({ ok: false, error: "The submitted message is too large." }, 413, env.ALLOWED_ORIGIN);
        }

        let payload;
        try {
            payload = JSON.parse(body);
        } catch {
            return jsonResponse({ ok: false, error: "Please check the form fields and try again." }, 400, env.ALLOWED_ORIGIN);
        }

        const validationError = validateSubmission(payload);
        if (validationError) {
            return jsonResponse({ ok: false, error: validationError }, 400, env.ALLOWED_ORIGIN);
        }

        const parameters = ["name", "email", "subject", "message"].map((field) => ({
            type: "text",
            text: payload[field].trim()
        }));

        let whatsappResponse;
        try {
            whatsappResponse = await fetch(
                `https://graph.facebook.com/${env.GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        to: env.WHATSAPP_RECIPIENT,
                        type: "template",
                        template: {
                            name: env.WHATSAPP_TEMPLATE_NAME,
                            language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
                            components: [{
                                type: "body",
                                parameters
                            }]
                        }
                    })
                }
            );
        } catch (error) {
            console.error("WhatsApp API request failed:", error);
            return jsonResponse({ ok: false, error: "WhatsApp could not be reached. Please try again later." }, 502, env.ALLOWED_ORIGIN);
        }

        if (!whatsappResponse.ok) {
            console.error("WhatsApp API rejected a notification with status:", whatsappResponse.status);
            return jsonResponse({ ok: false, error: "WhatsApp did not accept the notification. Please try again later." }, 502, env.ALLOWED_ORIGIN);
        }

        return jsonResponse({ ok: true }, 200, env.ALLOWED_ORIGIN);
    }
};
