import agoraToken from "agora-token";

export const generateAgoraToken = (channelName, uid = 0, role = agoraToken.RtcRole.SUBSCRIBER) => {
  try {
    const appId = process.env.VITE_AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();

    if (!appId || !appCertificate) {
      throw new Error(`Missing configuration - AppID: ${!!appId}, Cert: ${!!appCertificate}`);
    }

    // 1 hour expiry — enough for any class session
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = agoraToken.RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    return token;

  } catch (error) {
    console.error("❌ Token generation failed:", error.message);
    throw error;
  }
};

export const RtcRole = agoraToken.RtcRole;