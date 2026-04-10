import {
    AuthTokenDetails,
    PostDetails,
    PostResponse,
    SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { PlurkDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/plurk.dto';
import * as crypto from 'crypto';
import { Integration } from '@prisma/client';

export class PlurkProvider extends SocialAbstract implements SocialProvider {
    identifier = 'plurk';
    name = 'Plurk';
    isBetweenSteps = false;
    scopes = [] as string[];
    toolTip = 'You will be logged in into your current account.';
    editor = 'normal' as const;
    dto = PlurkDto;

    constructor() {
        super();
    }

    maxLength() {
        return 360;
    }

    private percentEncode(str: string): string {
        return encodeURIComponent(str)
            .replace(/!/g, '%21')
            .replace(/\*/g, '%2A')
            .replace(/'/g, '%27')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29');
    }

    private generateSignature(
        method: string,
        url: string,
        params: Record<string, string>,
        consumerSecret: string,
        tokenSecret: string = ''
    ): string {
        const sortedKeys = Object.keys(params).sort();
        const paramString = sortedKeys
            .map((key) => `${this.percentEncode(key)}=${this.percentEncode(params[key])}`)
            .join('&');

        const signatureBaseString = `${method.toUpperCase()}&${this.percentEncode(
            url
        )}&${this.percentEncode(paramString)}`;

        const signingKey = `${this.percentEncode(consumerSecret)}&${this.percentEncode(
            tokenSecret
        )}`;

        const hmac = crypto.createHmac('sha1', signingKey);
        hmac.update(signatureBaseString);
        return hmac.digest('base64');
    }

    private async oauthRequest(
        method: string,
        url: string,
        consumerKey: string,
        consumerSecret: string,
        token: string = '',
        tokenSecret: string = '',
        extraParams: Record<string, string> = {}
    ): Promise<string> {
        const oauthParams: Record<string, string> = {
            oauth_consumer_key: consumerKey,
            oauth_nonce: Math.random().toString(36).substring(2),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_version: '1.0',
        };

        if (token) {
            oauthParams.oauth_token = token;
        }

        const actualExtraParams: Record<string, string> = {};
        for (const key of Object.keys(extraParams)) {
            if (key.startsWith('oauth_')) {
                oauthParams[key] = extraParams[key];
            } else {
                actualExtraParams[key] = extraParams[key];
            }
        }

        // All parameters (oauth and extra) must be signed
        const allParamsForSignature = { ...oauthParams, ...actualExtraParams };
        const signature = this.generateSignature(
            method,
            url,
            allParamsForSignature,
            consumerSecret,
            tokenSecret
        );
        oauthParams.oauth_signature = signature;

        // ONLY oauth_* parameters should go into the Authorization header
        const authHeader =
            'OAuth ' +
            Object.keys(oauthParams)
                .sort() // Good practice to sort keys in header too
                .map(
                    (key) =>
                        `${this.percentEncode(key)}="${this.percentEncode(oauthParams[key])}"`
                )
                .join(', ');

        let fetchUrl = url;
        const bodyParams = new URLSearchParams();
        if (method === 'POST') {
            if (Object.keys(actualExtraParams).length > 0) {
                for (const key of Object.keys(actualExtraParams)) {
                    bodyParams.append(key, actualExtraParams[key]);
                }
            }
        }

        const options: RequestInit = {
            method,
            headers: {
                Authorization: authHeader,
                ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
            },
            ...(method === 'POST' && Object.keys(actualExtraParams).length > 0 ? { body: bodyParams.toString() } : {}),
        };

        if (method === 'GET' && Object.keys(actualExtraParams).length > 0) {
            const query = new URLSearchParams(actualExtraParams).toString();
            fetchUrl += `?${query}`;
        }

        const response = await this.fetch(fetchUrl, options);
        return response.text();
    }

    async generateAuthUrl() {
        const consumerKey = process.env.PLURK_CONSUMER_KEY!;
        const consumerSecret = process.env.PLURK_CONSUMER_SECRET!;
        const requestTokenUrl = 'https://www.plurk.com/OAuth/request_token';

        // Steps:
        // 1. Get Request Token
        const result = await this.oauthRequest(
            'POST',
            requestTokenUrl,
            consumerKey,
            consumerSecret,
            '',
            '',
            { oauth_callback: (process.env.FRONTEND_URL || 'https://postiz.com') + '/integrations/social/plurk' }
        );

        const params = new URLSearchParams(result);
        const oauthToken = params.get('oauth_token');
        const oauthTokenSecret = params.get('oauth_token_secret');

        if (!oauthToken || !oauthTokenSecret) {
            throw new Error('Failed to obtain request token');
        }

        return {
            url: `https://www.plurk.com/OAuth/authorize?oauth_token=${oauthToken}`,
            codeVerifier: oauthToken + ':' + oauthTokenSecret,
            state: oauthToken,
        };
    }

    async authenticate(params: { code: string; codeVerifier: string }) {
        const { code, codeVerifier } = params; // code is oauth_verifier, codeVerifier is oauth_token:oauth_token_secret
        const [oauthToken, oauthTokenSecret] = codeVerifier.split(':');
        const consumerKey = process.env.PLURK_CONSUMER_KEY!;
        const consumerSecret = process.env.PLURK_CONSUMER_SECRET!;
        const accessTokenUrl = 'https://www.plurk.com/OAuth/access_token';

        const result = await this.oauthRequest(
            'POST',
            accessTokenUrl,
            consumerKey,
            consumerSecret,
            oauthToken,
            oauthTokenSecret,
            { oauth_verifier: code }
        );

        const resultParams = new URLSearchParams(result);
        const accessToken = resultParams.get('oauth_token');
        const accessTokenSecret = resultParams.get('oauth_token_secret');
        const userId = resultParams.get('user_id'); // Optional, depending on response

        if (!accessToken || !accessTokenSecret) {
            throw new Error('Failed to obtain access token');
        }

        // Get User Profile
        // /APP/Users/me
        const meUrl = 'https://www.plurk.com/APP/Users/me';
        const meResult = await this.oauthRequest(
            'POST',
            meUrl,
            consumerKey,
            consumerSecret,
            accessToken,
            accessTokenSecret
        );

        const validJson = meResult.replace(/new\sDate\((.*?)\)/g, '"$1"');
        const me = JSON.parse(validJson);

        return {
            id: String(me.id),
            accessToken: accessToken + ':' + accessTokenSecret,
            name: me.display_name || me.full_name,
            refreshToken: '',
            expiresIn: 999999999, // Permanent
            picture: me.has_profile_image === 1
                ? (me.avatar
                    ? `https://avatars.plurk.com/${me.id}-medium${me.avatar}.gif`
                    : `https://avatars.plurk.com/${me.id}-medium.gif`)
                : 'https://www.plurk.com/static/default_medium.gif',
            username: me.nick_name,
        };
    }

    async refreshToken(): Promise<AuthTokenDetails> {
        // Plurk tokens do not expire
        return {} as any;
    }

    private async uploadPicture(
        token: string,
        tokenSecret: string,
        imageUrl: string
    ): Promise<string> {
        const consumerKey = process.env.PLURK_CONSUMER_KEY!;
        const consumerSecret = process.env.PLURK_CONSUMER_SECRET!;
        const uploadUrl = 'https://www.plurk.com/APP/Timeline/uploadPicture';

        // Fetch the image data
        const imageResponse = await this.fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBlob = new Blob([imageBuffer]);

        // For multipart/form-data with OAuth 1.0a, we need to:
        // 1. Generate OAuth signature (without the file data)
        // 2. Create multipart form with the image
        // 3. Send request with OAuth in Authorization header

        const oauthParams: Record<string, string> = {
            oauth_consumer_key: consumerKey,
            oauth_nonce: Math.random().toString(36).substring(2),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_version: '1.0',
            oauth_token: token,
        };

        // Generate signature (for multipart uploads, only OAuth params are signed)
        const signature = this.generateSignature(
            'POST',
            uploadUrl,
            oauthParams,
            consumerSecret,
            tokenSecret
        );
        oauthParams.oauth_signature = signature;

        // Build OAuth Authorization header
        const authHeader =
            'OAuth ' +
            Object.keys(oauthParams)
                .map(
                    (key) =>
                        `${this.percentEncode(key)}="${this.percentEncode(oauthParams[key])}"`
                )
                .join(', ');

        // Create multipart form data
        const formData = new FormData();
        // Extract filename from URL or use a default
        const filename = imageUrl.split('/').pop() || 'image.jpg';
        formData.append('image', imageBlob, filename);

        // Send the upload request
        const response = await this.fetch(uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: authHeader,
            },
            body: formData,
        });

        const result = await response.text();
        const validJson = result.replace(/new\sDate\((.*?)\)/g, '"$1"');
        const data = JSON.parse(validJson);

        if (data.error_text) {
            throw new Error(`Failed to upload image: ${data.error_text}`);
        }

        // Plurk returns the image URL in the response
        // The response typically includes 'full' and 'thumbnail' URLs
        return data.full || data.url || '';
    }

    private async postPlurkContent(
        token: string,
        tokenSecret: string,
        post: PostDetails
    ): Promise<{ plurk_id: number }> {
        const consumerKey = process.env.PLURK_CONSUMER_KEY!;
        const consumerSecret = process.env.PLURK_CONSUMER_SECRET!;

        const uploadedImageUrls: string[] = [];
        if (post.media && post.media.length > 0) {
            for (const media of post.media) {
                if (media.type === 'image') {
                    const imageUrl = await this.uploadPicture(token, tokenSecret, media.path);
                    if (imageUrl) {
                        uploadedImageUrls.push(imageUrl);
                    }
                }
            }
        }

        let content = post.message;
        if (uploadedImageUrls.length > 0) {
            content += '\n' + uploadedImageUrls.join('\n');
        }

        const qualifier = post.settings?.qualifier || ':';
        const lang = post.settings?.lang || 'tr_ch';

        const result = await this.oauthRequest(
            'POST',
            'https://www.plurk.com/APP/Timeline/plurkAdd',
            consumerKey,
            consumerSecret,
            token,
            tokenSecret,
            { content, qualifier, lang }
        );

        const validJson = result.replace(/new\sDate\((.*?)\)/g, '"$1"');
        const data = JSON.parse(validJson);

        if (data.error_text) {
            throw new Error(data.error_text);
        }

        return data;
    }

    async post(
        id: string,
        accessToken: string,
        postDetails: PostDetails[]
    ): Promise<PostResponse[]> {
        const [token, tokenSecret] = accessToken.split(':');
        const [firstPost] = postDetails;

        const data = await this.postPlurkContent(token, tokenSecret, firstPost);

        return [{
            id: firstPost.id,
            postId: String(data.plurk_id),
            releaseURL: `https://www.plurk.com/p/${data.plurk_id.toString(36)}`,
            status: 'posted',
        }];
    }

    async comment(
        id: string,
        postId: string,
        lastCommentId: string | undefined,
        accessToken: string,
        postDetails: PostDetails[]
    ): Promise<PostResponse[]> {
        const [token, tokenSecret] = accessToken.split(':');
        const consumerKey = process.env.PLURK_CONSUMER_KEY!;
        const consumerSecret = process.env.PLURK_CONSUMER_SECRET!;
        const [commentPost] = postDetails;

        const uploadedImageUrls: string[] = [];
        if (commentPost.media && commentPost.media.length > 0) {
            for (const media of commentPost.media) {
                if (media.type === 'image') {
                    const imageUrl = await this.uploadPicture(token, tokenSecret, media.path);
                    if (imageUrl) {
                        uploadedImageUrls.push(imageUrl);
                    }
                }
            }
        }

        let content = commentPost.message;
        if (uploadedImageUrls.length > 0) {
            content += '\n' + uploadedImageUrls.join('\n');
        }

        const qualifier = commentPost.settings?.qualifier || ':';

        const result = await this.oauthRequest(
            'POST',
            'https://www.plurk.com/APP/Responses/responseAdd',
            consumerKey,
            consumerSecret,
            token,
            tokenSecret,
            {
                plurk_id: postId,
                content,
                qualifier,
            }
        );

        const validJson = result.replace(/new\sDate\((.*?)\)/g, '"$1"');
        const data = JSON.parse(validJson);

        if (data.error_text) {
            throw new Error(data.error_text);
        }

        return [{
            id: commentPost.id,
            postId: String(data.id),
            releaseURL: `https://www.plurk.com/p/${Number(postId).toString(36)}`,
            status: 'posted',
        }];
    }
}
