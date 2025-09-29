export async function sendTelegramAlert(body, chatId = "-4895866665", token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1dWt5cXZuaXRsaGRod3lnZmN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYwNDc2MjMsImV4cCI6MjA1MTYyMzYyM30.M26CFOgXO6ISnrxVVTd_jGLiQZ_LLQcUMV2g8oSTpaU") {
    const url = `https://fuukyqvnitlhdhwygfcy.supabase.co/functions/v1/hyper-action?chat_id=${encodeURIComponent(chatId)}`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res
    } catch (error) {
        console.error("❌ Lỗi khi gửi alert:", error);
    }
}