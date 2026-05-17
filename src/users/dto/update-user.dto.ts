import { IsString, IsOptional, Length, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const SUPPORTED_CURRENCIES = [
  'XOF', 'XAF', 'MAD', 'DZD', 'TND', 'EGP', 'NGN', 'GHS', 'KES', 'ZAR',
  'EUR', 'GBP', 'CHF', 'NOK', 'SEK', 'PLN',
  'USD', 'CAD', 'BRL', 'MXN',
  'JPY', 'CNY', 'INR', 'AUD', 'SGD', 'AED', 'SAR',
];

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Madu' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'XOF', enum: SUPPORTED_CURRENCIES })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;
}
