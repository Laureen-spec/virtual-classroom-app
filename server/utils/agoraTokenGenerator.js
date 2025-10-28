import agoraToken from "agora-token";

export const generateAgoraToken = (channelName, uid = 0, role = agoraToken.RtcRole.PUBLISHER) => {
  try {
    const appId = process.env.VITE_AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();

    console.log("🔧 Debug Info:");
    console.log("App ID:", appId);
    console.log("Cert exists:", !!appCertificate);
    console.log("Cert length:", appCertificate?.length);

    if (!appId || !appCertificate) {
      throw new Error(`Missing configuration - AppID: ${!!appId}, Cert: ${!!appCertificate}`);
    }

    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Alternative method using the package directly
    const token = agoraToken.RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    console.log("✅ Token generated, length:", token.length);
    return token;

  } catch (error) {
    console.error("❌ Token generation failed:", error.message);
    throw error;
  }
};

export const RtcRole = agoraToken.RtcRole;