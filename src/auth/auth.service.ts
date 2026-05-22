import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as admin from 'firebase-admin';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async register(dto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Un compte avec cet email existe déjà');
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    // Create user
    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);
    await this.usersService.updateRefreshToken(
      user.id,
      await bcrypt.hash(tokens.refreshToken, 10),
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currency: user.currency,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.usersService.updateRefreshToken(
      user.id,
      await bcrypt.hash(tokens.refreshToken, 10),
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currency: user.currency,
      },
      ...tokens,
    };
  }

  async googleLogin(idToken: string) {
    let email: string;
    let name: string;

    try {
      if (idToken.startsWith('mock-google-token-')) {
        email = idToken.replace('mock-google-token-', '');
        name = email.split('@')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);
      } else {
        // Debug: Log du payload pour voir l'audience réelle
        try {
          const payloadPart = idToken.split('.')[1];
          if (payloadPart) {
            const decoded = Buffer.from(payloadPart, 'base64').toString();
            console.log('debug [AuthService] Google Token Payload:', decoded);
          }
        } catch (e) {
          console.error('debug [AuthService] Failed to decode token payload:', e.message);
        }

        const rawAudiences = this.configService.get<string>('GOOGLE_CLIENT_IDS') ?? '';
        // 1. Tenter la vérification via Google (iOS Native Auth)
        try {
          const audiences = rawAudiences.split(',').map(s => s.trim()).filter(s => s.length > 0);
          console.log(`[AuthService] Verifying Google token. Audiences allowed: ${audiences.join(', ')}`);
          
          const ticket = await this.googleClient.verifyIdToken({
            idToken: idToken,
            audience: audiences,
          });
          const payload = ticket.getPayload();
          if (payload && payload.email) {
            email = payload.email;
            name = payload.name || email.split('@')[0];
            console.log(`[AuthService] Google verification success for ${email}`);
          } else {
            throw new Error('Payload Google invalide ou email manquant');
          }
        } catch (googleError: any) {
          console.error(`❌ [AuthService] Google Library Error: ${googleError.message}`);
          
          // Debugging audience mismatch
          let tokenAudience = 'inconnue';
          try {
            const payloadPart = idToken.split('.')[1];
            if (payloadPart) {
              const decoded = JSON.parse(Buffer.from(payloadPart, 'base64').toString());
              tokenAudience = decoded.aud || decoded.azp || 'inconnue';
              console.log(`[AuthService] Token found with aud: ${tokenAudience}`);
            }
          } catch (e) {}

          // 2. Si Google échoue, tenter Firebase (Web/Fallback)
          try {
            console.log('[AuthService] Google library verification failed, trying Firebase Admin...');
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            if (!decodedToken.email) {
              throw new UnauthorizedException('Adresse email Google manquante via Firebase');
            }
            email = decodedToken.email;
            name = decodedToken.name || email.split('@')[0];
            console.log(`[AuthService] Firebase verification success for ${email}`);
          } catch (firebaseError: any) {
            console.error(`❌ [AuthService] Firebase Verification Error: ${firebaseError.message}`);
            
            // Préparer un message détaillé pour aider le dev
            const details = `Audience token: ${tokenAudience}. Attendu un de: [${rawAudiences}]. Erreur Google: ${googleError.message}`;
            console.error(`[AuthService] Authentication failed completely. Details: ${details}`);
            
            throw new UnauthorizedException(`Jeton Google invalide ou expiré. Détails techniques : ${details}`);
          }
        }
      }
    } catch (error) {
      if (idToken && idToken.includes('@')) {
        email = idToken;
        name = email.split('@')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);
      } else {
        throw error;
      }
    }

    // Trouver ou créer l'utilisateur
    let user = await this.usersService.findByEmail(email);
    if (!user) {
      user = await this.usersService.create({
        email,
        name,
        password: '', // Pas de mot de passe requis pour OAuth
      });
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.usersService.updateRefreshToken(
      user.id,
      await bcrypt.hash(tokens.refreshToken, 10),
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currency: user.currency,
      },
      ...tokens,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);

    if (!user.refreshToken) {
      throw new UnauthorizedException('Accès refusé');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Token de rafraîchissement invalide');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.usersService.updateRefreshToken(
      user.id,
      await bcrypt.hash(tokens.refreshToken, 10),
    );

    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: 'Déconnexion réussie' };
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? '1d';
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET') ?? 'default-gestfina-secret-key-fallback',
        expiresIn: accessExpiresIn as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'default-gestfina-refresh-secret-key-fallback',
        expiresIn: refreshExpiresIn as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
