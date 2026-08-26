import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { promises as fs } from "fs";

// POST /api/backup/google-drive
// Uploads the current SQLite DB file to the admin's Google Drive using the
// stored OAuth refresh token. Requires:
//   - settings.googleClientId
//   - settings.googleClientSecret
//   - settings.googleRefreshToken
// Returns { ok: true, fileId, fileName } on success.
export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const settings = await db.settings.findUnique({ where: { id: "shop" } });
    const clientId = settings?.googleClientId?.trim();
    const clientSecret = settings?.googleClientSecret?.trim();
    const refreshToken = settings?.googleRefreshToken?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        {
          error:
            "Google Drive is not connected. Set Client ID, Client Secret and Refresh Token in Settings.",
        },
        { status: 400 }
      );
    }

    // 1) Refresh the access token using the stored refresh token.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Google rejected the refresh token (HTTP ${tokenRes.status}). Verify your Client ID, Client Secret and Refresh Token. ${text}`.trim(),
        },
        { status: 400 }
      );
    }

    const tokenJson = await tokenRes.json();
    const accessToken: string | undefined = tokenJson?.access_token;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Google did not return an access token" },
        { status: 500 }
      );
    }

    // 2) Locate the SQLite DB file.
    const dbUrl = process.env.DATABASE_URL || "";
    const dbPath = dbUrl.replace("file:", "");
    if (!dbPath) {
      return NextResponse.json(
        { error: "DATABASE_URL is not configured" },
        { status: 500 }
      );
    }
    let dbBuffer: Buffer;
    try {
      dbBuffer = await fs.readFile(dbPath);
    } catch (e: any) {
      return NextResponse.json(
        { error: `Could not read DB file: ${e?.message || e}` },
        { status: 500 }
      );
    }

    // 3) Upload to Google Drive via multipart/related.
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `shop-pos-backup-${ts}.db`;
    const boundary = "shop_pos_" + Math.random().toString(36).slice(2);
    const metadata = JSON.stringify({ name: fileName, description: "Pakistan POS backup" });

    // Build the multipart body as a single Buffer. multipart/related parts
    // are separated by --<boundary> and the body is closed by --<boundary>--.
    const preParts: Buffer[] = [
      Buffer.from(`--${boundary}\r\n`, "utf8"),
      Buffer.from("Content-Type: application/json; charset=UTF-8\r\n\r\n", "utf8"),
      Buffer.from(metadata + "\r\n", "utf8"),
      Buffer.from(`--${boundary}\r\n`, "utf8"),
      Buffer.from("Content-Type: application/octet-stream\r\n\r\n", "utf8"),
    ];
    const postParts: Buffer[] = [
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ];
    const multipartBody = Buffer.concat([
      ...preParts,
      dbBuffer,
      ...postParts,
    ]);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(multipartBody.length),
        },
        body: multipartBody,
      }
    );

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Google Drive upload failed (HTTP ${uploadRes.status}). ${text}`.trim(),
        },
        { status: 502 }
      );
    }

    const uploadJson = await uploadRes.json().catch(() => ({}));
    const fileId: string | undefined = uploadJson?.id;
    if (!fileId) {
      return NextResponse.json(
        { error: "Drive accepted the upload but returned no file id" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      fileId,
      fileName,
      size: dbBuffer.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Google Drive backup failed" },
      { status: 500 }
    );
  }
}
