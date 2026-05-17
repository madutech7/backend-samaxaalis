import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionType,
  TransactionCategory,
} from '../entities/transaction.entity';

export class CreateTransactionDto {
  @ApiProperty({ example: 'Salaire mensuel' })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ example: 2800.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Le montant doit être supérieur à 0' })
  amount!: number;

  @ApiProperty({ enum: TransactionType, example: TransactionType.INCOME })
  @IsEnum(TransactionType)
  type!: TransactionType;

  @ApiProperty({
    enum: TransactionCategory,
    example: TransactionCategory.SALARY,
  })
  @IsEnum(TransactionCategory)
  category!: TransactionCategory;

  @ApiPropertyOptional({ example: 'Salaire de mai 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ example: '2026-05-17T10:00:00.000Z' })
  @IsDateString()
  date!: string;
}
